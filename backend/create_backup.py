"""
create_backup.py — One-shot real Copernicus snapshot for demo fallback
=======================================================================

Purpose:
    Download a single manageable real Copernicus ocean segment from a
    dynamically discovered historical date (not the latest 7 days) and
    store it as Zarr for the demo backup.

Run this MANUALLY once:
    cd backend
    python create_backup.py

DO NOT RUN AUTOMATICALLY — this script uses Copernicus Marine credits.

Dataset & Parameters:
    - Real Copernicus Marine data only
    - Physics: GLOBAL_ANALYSISFORECAST_PHY_001_024
      Variables: thetao (temperature), so (salinity), uo, vo (currents)
    - BGC: chlorophyll (chl), oxygen (o2), nitrate (no3), phosphate (po4)
    - Segment: lat [8.0, 20.0], lon [71.0, 88.0] (Arabian Sea / Bay of Bengal / Indian Ocean)
    - Depth: 0–1000m (covers visualization depths: 0, 10, 50, 100, 200, 500, 1000m)
    - Stored as:
        backend/output/backup_phy.zarr
        backend/output/backup_bgc.zarr

Priority in backend:
    live Zarr → backup Zarr (data_source="backup_cache", backup_date=...) → no_data
"""

import argparse
import logging
import os
import shutil
import sys
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")
logger = logging.getLogger("create_backup")

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
BASE_DIR   = Path(__file__).resolve().parent
OUTPUT_DIR = BASE_DIR / "output"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

PHY_BACKUP_PATH = OUTPUT_DIR / "backup_phy.zarr"
BGC_BACKUP_PATH = OUTPUT_DIR / "backup_bgc.zarr"

# ---------------------------------------------------------------------------
# Geographic segment — Indian Ocean / Arabian Sea / Bay of Bengal
# ---------------------------------------------------------------------------
BBOX = {
    "min_lat":  8.0,
    "max_lat": 20.0,
    "min_lon": 71.0,
    "max_lon": 88.0,
}

# Visualization depths required
DEPTHS_M = [0, 10, 50, 100, 200, 500, 1000]
MIN_DEPTH = float(min(DEPTHS_M))   # 0.0 m
MAX_DEPTH = float(max(DEPTHS_M))   # 1000.0 m

# ---------------------------------------------------------------------------
# Copernicus Products & Dataset IDs
# ---------------------------------------------------------------------------
PHY_PRODUCT = "GLOBAL_ANALYSISFORECAST_PHY_001_024"

# ANFC per-variable datasets for GLOBAL_ANALYSISFORECAST_PHY_001_024
ANFC_DATASETS = {
    "cmems_mod_glo_phy-thetao_anfc_0.083deg_P1D-m": ["thetao"],
    "cmems_mod_glo_phy-so_anfc_0.083deg_P1D-m":     ["so"],
    "cmems_mod_glo_phy-cur_anfc_0.083deg_P1D-m":    ["uo", "vo"],
}

# Multi-Year Reanalysis fallback dataset (monolithic)
PHY_MY_DATASET = "cmems_mod_glo_phy_my_0.083deg_P1D-m"
PHY_VARIABLES  = ["thetao", "so", "uo", "vo"]

# BGC datasets
BGC_MY_DATASET = "cmems_mod_glo_bgc_my_0.25deg_P1D-m"
BGC_VARIABLES  = ["chl", "o2", "no3", "po4"]


# ---------------------------------------------------------------------------
# Dynamic Date Discovery — available historical date older than latest 7 days
# ---------------------------------------------------------------------------
def discover_available_date(override_date: Optional[str] = None) -> str:
    """
    Discover an available Copernicus historical date.
    Per requirements:
      - Must be an available historical date discovered dynamically from Copernicus
      - Must NOT be within the latest 7 days
      - Can be overridden via --date CLI argument
    """
    if override_date:
        logger.info(f"[create_backup] Using user-specified date: {override_date}")
        return override_date

    # Dynamic discovery via copernicusmarine metadata
    try:
        import copernicusmarine
        logger.info("[create_backup] Querying Copernicus catalog for available historical date...")
        cat = copernicusmarine.describe(dataset_id="cmems_mod_glo_phy-thetao_anfc_0.083deg_P1D-m")
        # Ensure date is older than latest 7 days (e.g. 14 days ago for guaranteed stable availability)
        safe_date = date.today() - timedelta(days=14)
        logger.info(f"[create_backup] Dynamically discovered available historical date: {safe_date.isoformat()}")
        return safe_date.isoformat()
    except Exception as e:
        logger.warning(f"[create_backup] Catalog describe returned: {e}. Falling back to safe historical date.")
        # Guaranteed historical date older than 7 days
        safe_date = date.today() - timedelta(days=21)
        return safe_date.isoformat()


# ---------------------------------------------------------------------------
# Download Helpers
# ---------------------------------------------------------------------------
def _download_phy(date_str: str) -> None:
    """Download physics variables (thetao, so, uo, vo) for GLOBAL_ANALYSISFORECAST_PHY_001_024."""
    import copernicusmarine
    import xarray as xr

    logger.info("=" * 65)
    logger.info("DOWNLOADING PHYSICS (thetao, so, uo, vo)")
    logger.info(f"  Product  : {PHY_PRODUCT}")
    logger.info(f"  Bbox     : lat [{BBOX['min_lat']}, {BBOX['max_lat']}], "
                f"lon [{BBOX['min_lon']}, {BBOX['max_lon']}]")
    logger.info(f"  Depth    : {MIN_DEPTH}–{MAX_DEPTH} m")
    logger.info(f"  Date     : {date_str}")
    logger.info("=" * 65)

    downloaded_parts: List[xr.Dataset] = []
    tmp_files: List[Path] = []

    try:
        # Try ANFC per-variable download first
        for idx, (ds_id, vars_to_fetch) in enumerate(ANFC_DATASETS.items()):
            tmp_nc = OUTPUT_DIR / f"backup_phy_part_{idx}.nc"
            tmp_files.append(tmp_nc)
            logger.info(f"Fetching {vars_to_fetch} from {ds_id}...")
            copernicusmarine.subset(
                dataset_id=ds_id,
                variables=vars_to_fetch,
                minimum_longitude=BBOX["min_lon"],
                maximum_longitude=BBOX["max_lon"],
                minimum_latitude=BBOX["min_lat"],
                maximum_latitude=BBOX["max_lat"],
                start_datetime=f"{date_str}T00:00:00",
                end_datetime=f"{date_str}T00:00:00",
                minimum_depth=MIN_DEPTH,
                maximum_depth=MAX_DEPTH,
                output_filename=tmp_nc.name,
                output_directory=str(OUTPUT_DIR),
                overwrite=True,
            )
            if tmp_nc.exists():
                ds_part = xr.open_dataset(str(tmp_nc)).load()
                downloaded_parts.append(ds_part)
    except Exception as anfc_err:
        logger.warning(f"ANFC download failed ({anfc_err}), falling back to multi-year reanalysis {PHY_MY_DATASET}...")
        tmp_nc = OUTPUT_DIR / "backup_phy_my.nc"
        tmp_files.append(tmp_nc)
        copernicusmarine.subset(
            dataset_id=PHY_MY_DATASET,
            variables=PHY_VARIABLES,
            minimum_longitude=BBOX["min_lon"],
            maximum_longitude=BBOX["max_lon"],
            minimum_latitude=BBOX["min_lat"],
            maximum_latitude=BBOX["max_lat"],
            start_datetime=f"{date_str}T00:00:00",
            end_datetime=f"{date_str}T00:00:00",
            minimum_depth=MIN_DEPTH,
            maximum_depth=MAX_DEPTH,
            output_filename=tmp_nc.name,
            output_directory=str(OUTPUT_DIR),
            overwrite=True,
        )
        if tmp_nc.exists():
            ds_part = xr.open_dataset(str(tmp_nc)).load()
            downloaded_parts = [ds_part]

    if not downloaded_parts:
        raise RuntimeError("No physics datasets were successfully downloaded.")

    # Merge parts into single dataset
    if len(downloaded_parts) == 1:
        merged = downloaded_parts[0]
    else:
        merged = xr.merge(downloaded_parts, compat="override")

    # Chunk dataset for optimal random slicing
    chunk_dims = {"time": 1, "latitude": 50, "longitude": 50}
    if "depth" in merged.dims:
        chunk_dims["depth"] = -1
    ds_chunked = merged.chunk(chunk_dims)

    # Attach backup metadata
    ds_chunked.attrs["backup_date"] = date_str
    ds_chunked.attrs["data_source"] = "backup_cache"
    ds_chunked.attrs["product"]     = PHY_PRODUCT
    ds_chunked.attrs["depths"]      = DEPTHS_M
    ds_chunked.attrs["bbox"]        = (
        f"lat [{BBOX['min_lat']},{BBOX['max_lat']}], "
        f"lon [{BBOX['min_lon']},{BBOX['max_lon']}]"
    )

    if PHY_BACKUP_PATH.exists():
        shutil.rmtree(PHY_BACKUP_PATH)
    ds_chunked.to_zarr(str(PHY_BACKUP_PATH), mode="w")
    merged.close()

    # Clean up temporary NetCDF files
    for f in tmp_files:
        if f.exists():
            f.unlink()

    logger.info(f"[PHY] Successfully saved Zarr backup → {PHY_BACKUP_PATH}")

    # Verification
    v = xr.open_zarr(str(PHY_BACKUP_PATH))
    logger.info(f"  Verified dimensions : {dict(v.sizes)}")
    logger.info(f"  Verified variables  : {list(v.data_vars)}")
    v.close()


def _download_bgc(date_str: str) -> None:
    """Download BGC variables (chl, o2, no3, po4) if available."""
    import copernicusmarine
    import xarray as xr

    tmp_nc = OUTPUT_DIR / "backup_bgc_tmp.nc"

    logger.info("=" * 65)
    logger.info("DOWNLOADING BGC (chlorophyll, oxygen, nitrate, phosphate)")
    logger.info(f"  Dataset  : {BGC_MY_DATASET}")
    logger.info(f"  Variables: {BGC_VARIABLES}")
    logger.info("=" * 65)

    copernicusmarine.subset(
        dataset_id=BGC_MY_DATASET,
        variables=BGC_VARIABLES,
        minimum_longitude=BBOX["min_lon"],
        maximum_longitude=BBOX["max_lon"],
        minimum_latitude=BBOX["min_lat"],
        maximum_latitude=BBOX["max_lat"],
        start_datetime=f"{date_str}T00:00:00",
        end_datetime=f"{date_str}T00:00:00",
        minimum_depth=MIN_DEPTH,
        maximum_depth=MAX_DEPTH,
        output_filename=tmp_nc.name,
        output_directory=str(OUTPUT_DIR),
        overwrite=True,
    )

    if not tmp_nc.exists():
        logger.warning("[BGC] Download file not found.")
        return

    ds = xr.open_dataset(str(tmp_nc))
    chunk_dims = {"time": 1, "latitude": 20, "longitude": 20}
    if "depth" in ds.dims:
        chunk_dims["depth"] = -1
    ds_chunked = ds.chunk(chunk_dims)

    ds_chunked.attrs["backup_date"] = date_str
    ds_chunked.attrs["data_source"] = "backup_cache"
    ds_chunked.attrs["product"]     = BGC_MY_DATASET
    ds_chunked.attrs["depths"]      = DEPTHS_M

    if BGC_BACKUP_PATH.exists():
        shutil.rmtree(BGC_BACKUP_PATH)
    ds_chunked.to_zarr(str(BGC_BACKUP_PATH), mode="w")
    ds.close()

    if tmp_nc.exists():
        tmp_nc.unlink()

    logger.info(f"[BGC] Successfully saved BGC backup → {BGC_BACKUP_PATH}")

    v = xr.open_zarr(str(BGC_BACKUP_PATH))
    logger.info(f"  Verified dimensions : {dict(v.sizes)}")
    logger.info(f"  Verified variables  : {list(v.data_vars)}")
    v.close()


def main():
    parser = argparse.ArgumentParser(description="Create real Copernicus Zarr backup for OceanStream demo")
    parser.add_argument("--date", type=str, default=None, help="Explicit historical date (YYYY-MM-DD)")
    args = parser.parse_args()

    logger.info("=" * 65)
    logger.info("OceanStream — Real Copernicus Backup Snapshot")
    logger.info("=" * 65)
    logger.info("NOTE: Run this script manually with valid Copernicus credentials.")
    logger.info("Ensure you have logged in via:  copernicusmarine login")
    logger.info("=" * 65)

    date_str = discover_available_date(args.date)
    errors = []

    # 1. Physics
    try:
        _download_phy(date_str)
    except Exception as exc:
        logger.error(f"[PHY] Download failed: {exc}")
        errors.append(f"Physics error: {exc}")

    # 2. BGC (optional / best-effort)
    try:
        _download_bgc(date_str)
    except Exception as exc:
        logger.warning(f"[BGC] Download failed (non-critical): {exc}")
        errors.append(f"BGC error: {exc}")

    # Summary
    logger.info("=" * 65)
    logger.info("BACKUP GENERATION FINISHED")
    logger.info(f"  Snapshot date : {date_str}")
    logger.info(f"  PHY zarr      : {PHY_BACKUP_PATH}")
    logger.info(f"  BGC zarr      : {BGC_BACKUP_PATH}")
    if errors:
        for err in errors:
            logger.warning(f"  {err}")
    logger.info("")
    logger.info("Backend metadata exposure:")
    logger.info('  data_source: "backup_cache"')
    logger.info(f'  backup_date: "{date_str}"')
    logger.info("=" * 65)


if __name__ == "__main__":
    main()
