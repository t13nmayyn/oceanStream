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
from typing import Any, Dict, List, Optional

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

# Global background fetch queue — tracks active fetches to prevent duplicate work
_active_fetch_keys: set = set()
_active_fetch_lock = asyncio.Lock() if False else None  # will be created lazily


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
                        timeout=120.0,  # 2-minute cap per group
                    )
                if tmp_nc.exists():
                    return xr.open_dataset(str(tmp_nc)).load()
            except asyncio.TimeoutError:
                logger.error(f"[PHY TIMEOUT for {did}] exceeded 120s")
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
                for p in missing_pages:
                    if p.state.value == "FETCHING":
                        p.state = PageState.NOT_FETCHED
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

        zarr_size = _write_to_zarr(ds_new, PHY_ZARR_PATH)

        # Backward-compat: write thetao to ocean_data.zarr
        if "thetao" in ds_new:
            try:
                _write_to_zarr(ds_new[["thetao"]], OCEAN_ZARR_PATH)
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
) -> Dict[str, Any]:
    """
    Fetch BGC variables from the date-appropriate Copernicus BGC dataset(s)
    and merge into bgc_data.zarr.
    """
    import copernicusmarine

    if not credentials_present():
        return {"status": "skipped", "reason": "no_credentials"}

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
                        timeout=120.0,  # 2-minute cap per group
                    )
                if tmp_nc.exists():
                    return xr.open_dataset(str(tmp_nc)).load()
            except asyncio.TimeoutError:
                logger.error(f"[BGC TIMEOUT for {did}] exceeded 120s")
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
                from page_table import PageState
                for p in missing_pages:
                    if p.state.value == "FETCHING":
                        p.state = PageState.NOT_FETCHED
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

        zarr_size = _write_to_zarr(ds_new, BGC_ZARR_PATH)
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
