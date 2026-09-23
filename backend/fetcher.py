"""
fetcher.py — On-Demand Origin Fetch for oceanStream v3
=======================================================

Changes from v2:
  - Date-routed dataset selection (ANALYSISFORECAST vs MULTIYEAR) via router.py
  - Physics (thetao, so, uo, vo, zos) → output/phy_data.zarr
  - BGC (chl, no3, po4, si, o2, ph, spco2) → output/bgc_data.zarr
  - Backward-compat: ocean_data.zarr still written (thetao only) for old endpoints
  - fetch_phy_range() and fetch_bgc_range() are separate concerns
  - Both update the shared PageTable

Flow:
  1. PageTable.diff() finds missing pages
  2. fetch_phy_range() / fetch_bgc_range() are called with the minimal bounds
  3. copernicusmarine.subset() streams the scoped NetCDF
  4. Written into phy_data.zarr / bgc_data.zarr (merge if exists)
  5. PageTable updated: FETCHING → ON_DISK
  6. LRU eviction triggered if cap exceeded
"""

from __future__ import annotations

import asyncio
import logging
import os
import shutil
import tempfile
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import xarray as xr

from router import (
    phy_dataset, bgc_dataset, PHY_VARIABLES, BGC_VARIABLES,
    group_variables_by_dataset, dataset_for_variable,
)

logger = logging.getLogger("fetcher")

# ---------------------------------------------------------------------------
# Path resolution
# ---------------------------------------------------------------------------
_BASE_DIR   = Path(__file__).resolve().parent
_OUTPUT_DIR = _BASE_DIR / "output"
_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

PHY_ZARR_PATH    = _OUTPUT_DIR / "phy_data.zarr"
BGC_ZARR_PATH    = _OUTPUT_DIR / "bgc_data.zarr"
# Backward-compat alias (thetao only)
OCEAN_ZARR_PATH  = _OUTPUT_DIR / "ocean_data.zarr"
ARGO_ZARR_PATH   = _OUTPUT_DIR / "argo_data.zarr"

# Safety cap: max depth span per single fetch request — full ocean water column
MAX_FETCH_DEPTH_SPAN = 6000.0

# Spatial chunking: large bounding boxes are split into smaller tiles before
# sending to Copernicus. Copernicus becomes very slow (and often times out) for
# requests > ~5°×5°. Using 4° keeps each sub-request well within limits while
# still covering large regions by iterating over tiles.
MAX_BBOX_CHUNK_DEG: float = float(os.environ.get("OCEAN_CHUNK_DEG", "4.0"))


def _split_bbox_into_chunks(
    lat_min: float, lat_max: float,
    lon_min: float, lon_max: float,
    chunk_deg: float = MAX_BBOX_CHUNK_DEG,
) -> List[Tuple[float, float, float, float]]:
    """
    Split a possibly-large bounding box into a list of bounded sub-tiles.
    Returns a list of (lat_min, lat_max, lon_min, lon_max) tuples.
    Each tile is at most chunk_deg° on each side.
    If the bbox is already small enough, returns a single-element list.
    """
    tiles = []
    lat = lat_min
    while lat < lat_max - 1e-6:
        lat_hi = min(lat + chunk_deg, lat_max)
        lon = lon_min
        while lon < lon_max - 1e-6:
            lon_hi = min(lon + chunk_deg, lon_max)
            tiles.append((lat, lat_hi, lon, lon_hi))
            lon = lon_hi
        lat = lat_hi
    return tiles or [(lat_min, lat_max, lon_min, lon_max)]

# ---------------------------------------------------------------------------
# Credentials
# ---------------------------------------------------------------------------
try:
    import dotenv
    _env_f = _BASE_DIR.parent / ".env"
    if _env_f.exists():
        dotenv.load_dotenv(_env_f)
except Exception:
    pass


def credentials_present() -> bool:
    return bool(
        os.environ.get("COPERNICUSMARINE_SERVICE_USERNAME")
        and os.environ.get("COPERNICUSMARINE_SERVICE_PASSWORD")
    )


# ---------------------------------------------------------------------------
# Concurrency control — max 2 simultaneous Copernicus downloads to prevent
# flooding the API and exhausting the event loop thread pool.
# ---------------------------------------------------------------------------
_COPERNICUS_SEM: Optional[asyncio.Semaphore] = None   # initialised lazily (needs running loop)
_COPERNICUS_MAX_CONCURRENT = 2

# Hard timeout per download group — real Copernicus transfers can take several
# minutes for large regions; 120s was too short.
# asyncio.wait_for cancels the *awaiting coroutine* but the run_in_executor thread
# cannot be force-stopped. After FETCH_TIMEOUT_SECONDS the task is marked FAILED
# so the request can be retried rather than staying FETCHING forever.
FETCH_TIMEOUT_SECONDS: float = float(os.environ.get("OCEAN_FETCH_TIMEOUT", "300"))


def _get_copernicus_sem() -> asyncio.Semaphore:
    """Return the global Copernicus semaphore, creating it if needed."""
    global _COPERNICUS_SEM
    if _COPERNICUS_SEM is None:
        _COPERNICUS_SEM = asyncio.Semaphore(_COPERNICUS_MAX_CONCURRENT)
    return _COPERNICUS_SEM



# ---------------------------------------------------------------------------
# Internal: write new data into a zarr store (create or merge)
# ---------------------------------------------------------------------------

def _write_to_zarr(ds_new: xr.Dataset, zarr_path: Path) -> int:
    """
    Merge ds_new into an existing zarr store at zarr_path, or create it fresh.
    Uses a safe atomic swap (write to tmp → rename) to avoid partial reads.
    Returns the total zarr dir size in bytes after writing.
    """
    chunks = {"time": 1}
    if "depth" in ds_new.dims:
        chunks["depth"] = min(10, ds_new.sizes["depth"])
    for lat_col in ("latitude", "lat"):
        if lat_col in ds_new.dims:
            chunks[lat_col] = min(50, ds_new.sizes[lat_col])
    for lon_col in ("longitude", "lon"):
        if lon_col in ds_new.dims:
            chunks[lon_col] = min(50, ds_new.sizes[lon_col])

    ds_chunked = ds_new.chunk(chunks)

    tmp_zarr = zarr_path.parent / f"_{zarr_path.name}_tmp"
    # Clean up any stale tmp from a previous failed run
    if tmp_zarr.exists():
        shutil.rmtree(tmp_zarr)

    if zarr_path.exists():
        try:
            ds_existing = xr.open_zarr(zarr_path, consolidated=True)
            ds_combined = xr.merge([ds_existing, ds_chunked], compat="override", join="outer")
            # Remove duplicate coordinate values along each dimension
            for dim in ("time", "depth", "latitude", "longitude", "lat", "lon"):
                if dim in ds_combined.dims and dim in ds_combined.coords:
                    try:
                        _, idx = np.unique(ds_combined[dim].values, return_index=True)
                        if len(idx) < ds_combined.sizes[dim]:
                            ds_combined = ds_combined.isel({dim: np.sort(idx)})
                    except Exception:
                        pass
            ds_combined = ds_combined.chunk(chunks)
            ds_existing.close()
        except Exception as e:
            logger.warning(f"[Zarr merge] failed ({e}), creating fresh store with new data only")
            ds_combined = ds_chunked

        ds_combined.to_zarr(tmp_zarr, mode="w", consolidated=True)
        ds_combined.close()
        # Atomic swap
        old_zarr = zarr_path.parent / f"_{zarr_path.name}_old"
        if zarr_path.exists():
            zarr_path.rename(old_zarr)
        tmp_zarr.rename(zarr_path)
        if old_zarr.exists():
            shutil.rmtree(old_zarr)
    else:
        ds_chunked.to_zarr(zarr_path, mode="w", consolidated=True)

    return sum(f.stat().st_size for f in zarr_path.rglob("*") if f.is_file())



# ---------------------------------------------------------------------------
# Physics fetch
# ---------------------------------------------------------------------------

async def fetch_phy_range(
    lat_min: float, lat_max: float,
    lon_min: float, lon_max: float,
    depth_min: float, depth_max: float,
    date_str: str,
    variables: Optional[List[str]] = None,
    page_table=None,
    missing_pages=None,
    on_tile_complete=None,
) -> Dict[str, Any]:
    """
    Fetch physics variables from the date-appropriate Copernicus dataset(s)
    and merge into phy_data.zarr. Also writes thetao to ocean_data.zarr
    for backward compatibility with old endpoints.
    """
    import copernicusmarine

    if not credentials_present():
        logger.warning("[PHY] Copernicus credentials not found — skipping fetch")
        return {"status": "skipped", "reason": "no_credentials"}

    # ---- Spatial chunking ----
    # Split large bboxes into bounded tiles so each Copernicus request stays fast.
    bbox_lat = lat_max - lat_min
    bbox_lon = lon_max - lon_min
    if bbox_lat > MAX_BBOX_CHUNK_DEG or bbox_lon > MAX_BBOX_CHUNK_DEG:
        tiles = _split_bbox_into_chunks(lat_min, lat_max, lon_min, lon_max)
        logger.info(
            f"[PHY] Large bbox ({bbox_lat:.1f}°lat × {bbox_lon:.1f}°lon) → "
            f"splitting into {len(tiles)} tiles of ≤{MAX_BBOX_CHUNK_DEG}°"
        )
        tile_tasks = []
        for (tlat_min, tlat_max, tlon_min, tlon_max) in tiles:
            async def _run_tile(tlat_min, tlat_max, tlon_min, tlon_max):
                res = await fetch_phy_range(
                    tlat_min, tlat_max, tlon_min, tlon_max,
                    depth_min=depth_min, depth_max=depth_max,
                    date_str=date_str, variables=variables,
                    page_table=None, missing_pages=None,
                    on_tile_complete=on_tile_complete,
                )
                if isinstance(res, dict) and res.get("status") == "success":
                    if on_tile_complete:
                        if asyncio.iscoroutinefunction(on_tile_complete):
                            await on_tile_complete(tlat_min, tlat_max, tlon_min, tlon_max)
                        else:
                            on_tile_complete(tlat_min, tlat_max, tlon_min, tlon_max)
                return res
            tile_tasks.append(asyncio.create_task(_run_tile(tlat_min, tlat_max, tlon_min, tlon_max)))
        tile_results = await asyncio.gather(*tile_tasks, return_exceptions=True)
        successes = [r for r in tile_results if isinstance(r, dict) and r.get("status") == "success"]
        errors    = [r for r in tile_results if not isinstance(r, dict) or r.get("status") != "success"]
        if errors:
            logger.warning(f"[PHY] {len(errors)}/{len(tiles)} tile fetches failed")
        if successes:
            if page_table and missing_pages:
                # All tiles written to Zarr; now update page table
                zarr_size = sum(f.stat().st_size for f in PHY_ZARR_PATH.rglob("*") if f.is_file()) if PHY_ZARR_PATH.exists() else 0
                per_page = zarr_size // max(1, len(missing_pages))
                for p in missing_pages:
                    page_table.mark_on_disk(p.page_id, size_bytes=per_page)
                if page_table.needs_eviction():
                    page_table.evict_lru()
            return {"status": "success", "date": date_str, "tiles": len(successes)}
        if page_table and missing_pages:
            page_table.mark_failed(missing_pages)
        return {"status": "error", "error": "All tile fetches failed", "date": date_str}

    depth_span = depth_max - depth_min
    if depth_span > MAX_FETCH_DEPTH_SPAN:
        depth_max = depth_min + MAX_FETCH_DEPTH_SPAN
        logger.warning(f"[PHY] Depth span clamped to {MAX_FETCH_DEPTH_SPAN}m")

    fetch_vars = variables or PHY_VARIABLES
    groups = group_variables_by_dataset(fetch_vars, date_str)
    start_dt = f"{date_str}T00:00:00"
    end_dt   = f"{date_str}T23:59:59"

    logger.info(
        f"[PHY] date={date_str} groups={list(groups.keys())} lat=[{lat_min},{lat_max}] lon=[{lon_min},{lon_max}] "
        f"depth=[{depth_min},{depth_max}] vars={fetch_vars}"
    )
    t0 = time.perf_counter()

    ds_parts = []
    with tempfile.TemporaryDirectory(prefix="ocean_phy_") as tmpdir:
        async def _download_phy_group(part_idx: int, did: str, vl: List[str]) -> Optional[xr.Dataset]:
            tmp_nc = Path(tmpdir) / f"phy_part_{part_idx}.nc"
            has_depth = any(v not in ("zos", "mlotst") for v in vl)
            eff_min = max(0.0, float(depth_min)) if has_depth else None
            eff_max = max(eff_min, float(depth_max)) if (has_depth and eff_min is not None) else None
            sem = _get_copernicus_sem()
            try:
                async with sem:
                    loop = asyncio.get_event_loop()
                    await asyncio.wait_for(
                        loop.run_in_executor(
                            None,
                            lambda: copernicusmarine.subset(
                                dataset_id=did,
                                variables=vl,
                                minimum_longitude=lon_min,
                                maximum_longitude=lon_max,
                                minimum_latitude=lat_min,
                                maximum_latitude=lat_max,
                                start_datetime=start_dt,
                                end_datetime=end_dt,
                                minimum_depth=eff_min,
                                maximum_depth=eff_max,
                                output_filename=tmp_nc.name,
                                output_directory=tmpdir,
                                overwrite=True,
                            ),
                        ),
                        timeout=FETCH_TIMEOUT_SECONDS,
                    )
                if tmp_nc.exists():
                    return xr.open_dataset(str(tmp_nc)).load()
            except asyncio.TimeoutError:
                logger.error(
                    f"[PHY TIMEOUT for {did}] exceeded {FETCH_TIMEOUT_SECONDS:.0f}s — "
                    "executor thread will continue in background but pages marked FAILED"
                )
            except Exception as e:
                logger.error(f"[PHY FETCH ERROR for {did}] {e}")
            return None

        tasks = [
            _download_phy_group(i + 1, ds_id, v_list)
            for i, (ds_id, v_list) in enumerate(groups.items())
        ]
        results = await asyncio.gather(*tasks, return_exceptions=False)
        ds_parts = [r for r in results if r is not None]

        if not ds_parts:
            if page_table and missing_pages:
                from page_table import PageState
                page_table.mark_failed(missing_pages)
            return {"status": "error", "error": "All physics dataset fetches failed", "date": date_str}


        fetch_ms = round((time.perf_counter() - t0) * 1000, 1)
        logger.info(f"[PHY] Download done in {fetch_ms}ms ({len(ds_parts)} parts) — merging into zarr...")

        if len(ds_parts) == 1:
            ds_new = ds_parts[0]
        else:
            try:
                ds_new = xr.merge(ds_parts, compat="override")
            except Exception as m_err:
                logger.warning(f"[PHY merge parts failed: {m_err}], using primary part")
                ds_new = ds_parts[0]

        loop = asyncio.get_event_loop()
        zarr_size = await loop.run_in_executor(None, _write_to_zarr, ds_new, PHY_ZARR_PATH)

        # Backward-compat: write thetao to ocean_data.zarr
        if "thetao" in ds_new:
            try:
                await loop.run_in_executor(None, _write_to_zarr, ds_new[["thetao"]], OCEAN_ZARR_PATH)
            except Exception as bc_err:
                logger.debug(f"[PHY] compat ocean_data.zarr write failed: {bc_err}")

        for p_ds in ds_parts:
            p_ds.close()
        merge_ms = round((time.perf_counter() - t0) * 1000 - fetch_ms, 1)

    if page_table and missing_pages:
        per_page = zarr_size // max(1, len(missing_pages))
        for p in missing_pages:
            page_table.mark_on_disk(p.page_id, size_bytes=per_page)
        if page_table.needs_eviction():
            evicted = page_table.evict_lru()
            logger.info(f"[LRU] Evicted {len(evicted)} phy pages")

    total_ms = round((time.perf_counter() - t0) * 1000, 1)
    logger.info(f"[PHY] Complete: fetch={fetch_ms}ms merge={merge_ms}ms total={total_ms}ms")
    return {
        "status": "success",
        "date": date_str,
        "fetch_ms": fetch_ms,
        "merge_ms": merge_ms,
        "total_ms": total_ms,
        "pages_updated": len(missing_pages) if missing_pages else 0,
        "zarr_size_bytes": zarr_size,
    }


# ---------------------------------------------------------------------------
# BGC fetch
# ---------------------------------------------------------------------------

async def fetch_bgc_range(
    lat_min: float, lat_max: float,
    lon_min: float, lon_max: float,
    depth_min: float, depth_max: float,
    date_str: str,
    variables: Optional[List[str]] = None,
    page_table=None,
    missing_pages=None,
    on_tile_complete=None,
) -> Dict[str, Any]:
    """
    Fetch BGC variables from the date-appropriate Copernicus BGC dataset(s)
    and merge into bgc_data.zarr.
    """
    import copernicusmarine

    if not credentials_present():
        return {"status": "skipped", "reason": "no_credentials"}

    # ---- Spatial chunking ----
    bbox_lat = lat_max - lat_min
    bbox_lon = lon_max - lon_min
    if bbox_lat > MAX_BBOX_CHUNK_DEG or bbox_lon > MAX_BBOX_CHUNK_DEG:
        tiles = _split_bbox_into_chunks(lat_min, lat_max, lon_min, lon_max)
        logger.info(
            f"[BGC] Large bbox ({bbox_lat:.1f}°lat × {bbox_lon:.1f}°lon) → "
            f"splitting into {len(tiles)} tiles of ≤{MAX_BBOX_CHUNK_DEG}°"
        )
        tile_tasks = []
        for (tlat_min, tlat_max, tlon_min, tlon_max) in tiles:
            async def _run_bgc_tile(tlat_min, tlat_max, tlon_min, tlon_max):
                res = await fetch_bgc_range(
                    tlat_min, tlat_max, tlon_min, tlon_max,
                    depth_min=depth_min, depth_max=depth_max,
                    date_str=date_str, variables=variables,
                    page_table=None, missing_pages=None,
                    on_tile_complete=on_tile_complete,
                )
                if isinstance(res, dict) and res.get("status") == "success":
                    if on_tile_complete:
                        if asyncio.iscoroutinefunction(on_tile_complete):
                            await on_tile_complete(tlat_min, tlat_max, tlon_min, tlon_max)
                        else:
                            on_tile_complete(tlat_min, tlat_max, tlon_min, tlon_max)
                return res
            tile_tasks.append(asyncio.create_task(_run_bgc_tile(tlat_min, tlat_max, tlon_min, tlon_max)))
        tile_results = await asyncio.gather(*tile_tasks, return_exceptions=True)
        successes = [r for r in tile_results if isinstance(r, dict) and r.get("status") == "success"]
        errors    = [r for r in tile_results if not isinstance(r, dict) or r.get("status") != "success"]
        if errors:
            logger.warning(f"[BGC] {len(errors)}/{len(tiles)} tile fetches failed")
        if successes:
            if page_table and missing_pages:
                zarr_size = sum(f.stat().st_size for f in BGC_ZARR_PATH.rglob("*") if f.is_file()) if BGC_ZARR_PATH.exists() else 0
                per_page = zarr_size // max(1, len(missing_pages))
                for p in missing_pages:
                    page_table.mark_on_disk(p.page_id, size_bytes=per_page)
                if page_table.needs_eviction():
                    page_table.evict_lru()
            return {"status": "success", "date": date_str, "tiles": len(successes)}
        if page_table and missing_pages:
            page_table.mark_failed(missing_pages)
        return {"status": "error", "error": "All BGC tile fetches failed", "date": date_str}

    fetch_vars = variables or BGC_VARIABLES
    groups = group_variables_by_dataset(fetch_vars, date_str)
    start_dt   = f"{date_str}T00:00:00"
    end_dt     = f"{date_str}T23:59:59"

    logger.info(
        f"[BGC] date={date_str} groups={list(groups.keys())} lat=[{lat_min},{lat_max}] lon=[{lon_min},{lon_max}] "
        f"depth=[{depth_min},{depth_max}] vars={fetch_vars}"
    )
    t0 = time.perf_counter()

    ds_parts = []
    with tempfile.TemporaryDirectory(prefix="ocean_bgc_") as tmpdir:
        eff_min = max(0.0, float(depth_min))
        eff_max = max(eff_min, float(depth_max))

        async def _download_bgc_group(part_idx: int, did: str, vl: List[str]) -> Optional[xr.Dataset]:
            tmp_nc = Path(tmpdir) / f"bgc_part_{part_idx}.nc"
            sem = _get_copernicus_sem()
            try:
                async with sem:
                    loop = asyncio.get_event_loop()
                    await asyncio.wait_for(
                        loop.run_in_executor(
                            None,
                            lambda: copernicusmarine.subset(
                                dataset_id=did,
                                variables=vl,
                                minimum_longitude=lon_min,
                                maximum_longitude=lon_max,
                                minimum_latitude=lat_min,
                                maximum_latitude=lat_max,
                                start_datetime=start_dt,
                                end_datetime=end_dt,
                                minimum_depth=eff_min,
                                maximum_depth=eff_max,
                                output_filename=tmp_nc.name,
                                output_directory=tmpdir,
                                overwrite=True,
                            ),
                        ),
                        timeout=FETCH_TIMEOUT_SECONDS,
                    )
                if tmp_nc.exists():
                    return xr.open_dataset(str(tmp_nc)).load()
            except asyncio.TimeoutError:
                logger.error(
                    f"[BGC TIMEOUT for {did}] exceeded {FETCH_TIMEOUT_SECONDS:.0f}s — "
                    "executor thread will continue in background but pages marked FAILED"
                )
            except Exception as e:
                logger.error(f"[BGC FETCH ERROR for {did}] {e}")
            return None

        tasks = [
            _download_bgc_group(i + 1, ds_id, v_list)
            for i, (ds_id, v_list) in enumerate(groups.items())
        ]
        results = await asyncio.gather(*tasks, return_exceptions=False)
        ds_parts = [r for r in results if r is not None]

        if not ds_parts:
            if page_table and missing_pages:
                page_table.mark_failed(missing_pages)
            return {"status": "error", "error": "All BGC dataset fetches failed", "date": date_str}


        fetch_ms = round((time.perf_counter() - t0) * 1000, 1)
        logger.info(f"[BGC] Download done in {fetch_ms}ms ({len(ds_parts)} parts) — merging...")

        if len(ds_parts) == 1:
            ds_new = ds_parts[0]
        else:
            try:
                ds_new = xr.merge(ds_parts, compat="override")
            except Exception as m_err:
                logger.warning(f"[BGC merge parts failed: {m_err}], using primary part")
                ds_new = ds_parts[0]

        loop = asyncio.get_event_loop()
        zarr_size = await loop.run_in_executor(None, _write_to_zarr, ds_new, BGC_ZARR_PATH)
        for p_ds in ds_parts:
            p_ds.close()
        merge_ms = round((time.perf_counter() - t0) * 1000 - fetch_ms, 1)

    if page_table and missing_pages:
        per_page = zarr_size // max(1, len(missing_pages))
        for p in missing_pages:
            page_table.mark_on_disk(p.page_id, size_bytes=per_page)
        if page_table.needs_eviction():
            evicted = page_table.evict_lru()
            logger.info(f"[LRU] Evicted {len(evicted)} bgc pages")

    total_ms = round((time.perf_counter() - t0) * 1000, 1)
    return {
        "status": "success",
        "date": date_str,
        "fetch_ms": fetch_ms,
        "merge_ms": merge_ms,
        "total_ms": total_ms,
        "pages_updated": len(missing_pages) if missing_pages else 0,
        "zarr_size_bytes": zarr_size,
    }


# ---------------------------------------------------------------------------
# Combined point fetch (PHY + BGC together)
# ---------------------------------------------------------------------------

async def fetch_point(
    lat: float, lon: float,
    depth: float,
    date_str: str,
    pad_deg: float = 0.5,
    page_table=None,
    missing_pages=None,
) -> Dict[str, Any]:
    """Fetch both PHY and BGC for a single point. Called on cache miss."""
    lat_min = lat - pad_deg
    lat_max = lat + pad_deg
    lon_min = lon - pad_deg
    lon_max = lon + pad_deg
    depth_min = max(0.0, depth - 5.0)
    depth_max = depth + 5.0

    phy_result, bgc_result = await asyncio.gather(
        fetch_phy_range(lat_min, lat_max, lon_min, lon_max,
                        depth_min, depth_max, date_str,
                        page_table=page_table, missing_pages=missing_pages),
        fetch_bgc_range(lat_min, lat_max, lon_min, lon_max,
                        depth_min, depth_max, date_str,
                        page_table=page_table, missing_pages=missing_pages),
        return_exceptions=True,
    )

    phy_ok = not isinstance(phy_result, Exception) and (phy_result or {}).get("status") == "success"
    bgc_ok = not isinstance(bgc_result, Exception) and (bgc_result or {}).get("status") == "success"

    return {
        "phy": phy_result if not isinstance(phy_result, Exception) else {"status": "error", "error": str(phy_result)},
        "bgc": bgc_result if not isinstance(bgc_result, Exception) else {"status": "error", "error": str(bgc_result)},
        "any_success": phy_ok or bgc_ok,
    }
