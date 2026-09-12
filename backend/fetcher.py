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

from router import phy_dataset, bgc_dataset, PHY_VARIABLES, BGC_VARIABLES

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

# Safety cap: max depth span per single fetch request
MAX_FETCH_DEPTH_SPAN = 100.0

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
# Internal: write new data into a zarr store (create or merge)
# ---------------------------------------------------------------------------

def _write_to_zarr(ds_new: xr.Dataset, zarr_path: Path) -> int:
    """
    Merge ds_new into an existing zarr store at zarr_path, or create it fresh.
    Returns the total zarr dir size in bytes after writing.
    """
    ds_chunked = ds_new.chunk({"time": 1, "latitude": 50, "longitude": 50})

    if zarr_path.exists():
        ds_existing = xr.open_zarr(zarr_path)
        try:
            ds_combined = xr.combine_by_coords(
                [ds_existing, ds_chunked],
                combine_attrs="override",
                join="outer",
            )
            ds_combined = ds_combined.chunk({"time": 1, "latitude": 50, "longitude": 50})
        except Exception as e:
            logger.warning(f"[Zarr merge] combine_by_coords failed ({e}), falling back to override write")
            ds_combined = ds_chunked
        finally:
            ds_existing.close()

        tmp_zarr = zarr_path.parent / f"_{zarr_path.name}_tmp"
        if tmp_zarr.exists():
            shutil.rmtree(tmp_zarr)
        ds_combined.to_zarr(tmp_zarr, mode="w")
        ds_combined.close()
        if zarr_path.exists():
            shutil.rmtree(zarr_path)
        tmp_zarr.rename(zarr_path)
    else:
        ds_chunked.to_zarr(zarr_path, mode="w")

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
    Fetch physics variables from the date-appropriate Copernicus dataset
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

    dataset_id = phy_dataset(date_str)
    fetch_vars = variables or PHY_VARIABLES
    start_dt = f"{date_str}T00:00:00"
    end_dt   = f"{date_str}T23:59:59"

    logger.info(
        f"[PHY] dataset={dataset_id} lat=[{lat_min},{lat_max}] lon=[{lon_min},{lon_max}] "
        f"depth=[{depth_min},{depth_max}] date={date_str} vars={fetch_vars}"
    )
    t0 = time.perf_counter()

    with tempfile.TemporaryDirectory(prefix="ocean_phy_") as tmpdir:
        tmp_nc = Path(tmpdir) / "phy.nc"
        try:
            await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: copernicusmarine.subset(
                    dataset_id=dataset_id,
                    variables=fetch_vars,
                    minimum_longitude=lon_min,
                    maximum_longitude=lon_max,
                    minimum_latitude=lat_min,
                    maximum_latitude=lat_max,
                    start_datetime=start_dt,
                    end_datetime=end_dt,
                    minimum_depth=max(0.49, depth_min),
                    maximum_depth=depth_max,
                    output_filename=tmp_nc.name,
                    output_directory=tmpdir,
                    overwrite=True,
                ),
            )
        except Exception as e:
            logger.error(f"[PHY FETCH ERROR] {e}")
            if page_table and missing_pages:
                from page_table import PageState
                for p in missing_pages:
                    if p.state.value == "FETCHING":
                        p.state = PageState.NOT_FETCHED
            return {"status": "error", "error": str(e), "dataset": dataset_id}

        fetch_ms = round((time.perf_counter() - t0) * 1000, 1)
        logger.info(f"[PHY] Download done in {fetch_ms}ms — merging into zarr...")

        ds_new = xr.open_dataset(str(tmp_nc))
        zarr_size = _write_to_zarr(ds_new, PHY_ZARR_PATH)

        # Backward-compat: write thetao to ocean_data.zarr
        if "thetao" in ds_new:
            try:
                _write_to_zarr(ds_new[["thetao"]], OCEAN_ZARR_PATH)
            except Exception as bc_err:
                logger.debug(f"[PHY] compat ocean_data.zarr write failed: {bc_err}")

        ds_new.close()
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
        "dataset": dataset_id,
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
    Fetch BGC variables from the date-appropriate Copernicus BGC dataset
    and merge into bgc_data.zarr.
    """
    import copernicusmarine

    if not credentials_present():
        return {"status": "skipped", "reason": "no_credentials"}

    dataset_id = bgc_dataset(date_str)
    fetch_vars = variables or BGC_VARIABLES
    start_dt   = f"{date_str}T00:00:00"
    end_dt     = f"{date_str}T23:59:59"

    logger.info(
        f"[BGC] dataset={dataset_id} lat=[{lat_min},{lat_max}] lon=[{lon_min},{lon_max}] "
        f"depth=[{depth_min},{depth_max}] date={date_str} vars={fetch_vars}"
    )
    t0 = time.perf_counter()

    with tempfile.TemporaryDirectory(prefix="ocean_bgc_") as tmpdir:
        tmp_nc = Path(tmpdir) / "bgc.nc"
        try:
            await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: copernicusmarine.subset(
                    dataset_id=dataset_id,
                    variables=fetch_vars,
                    minimum_longitude=lon_min,
                    maximum_longitude=lon_max,
                    minimum_latitude=lat_min,
                    maximum_latitude=lat_max,
                    start_datetime=start_dt,
                    end_datetime=end_dt,
                    minimum_depth=max(0.49, depth_min),
                    maximum_depth=depth_max,
                    output_filename=tmp_nc.name,
                    output_directory=tmpdir,
                    overwrite=True,
                ),
            )
        except Exception as e:
            logger.error(f"[BGC FETCH ERROR] {e}")
            if page_table and missing_pages:
                from page_table import PageState
                for p in missing_pages:
                    if p.state.value == "FETCHING":
                        p.state = PageState.NOT_FETCHED
            return {"status": "error", "error": str(e), "dataset": dataset_id}

        fetch_ms = round((time.perf_counter() - t0) * 1000, 1)
        logger.info(f"[BGC] Download done in {fetch_ms}ms — merging...")

        ds_new = xr.open_dataset(str(tmp_nc))
        zarr_size = _write_to_zarr(ds_new, BGC_ZARR_PATH)
        ds_new.close()
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
        "dataset": dataset_id,
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
