"""
================================================================================
SIH26067 - INCOIS Ocean 3D Visualization Platform (Phase 1)
data_fetch.py — Offline Data Ingestion & Pre-processing (L3 Cold Storage -> L2 Zarr)
================================================================================

PURPOSE & ARCHITECTURE CONTEXT:
Copernicus Marine and Argo (via argopy/ERDDAP) are slow batch-download sources.
They take seconds to minutes to deliver queries and CANNOT be queried during
a live client request.

This script represents our offline L3 layer:
  - L3: Copernicus & Argo APIs (slow origin, touched ONLY here, once offline).
  - L2: Chunked Zarr files on disk (output/ocean_data.zarr, output/argo_data.zarr).
  - L1: In-memory dictionary in FastAPI (populated on-demand from L2, never touching L3).

WHAT THIS SCRIPT DOES:
1. Defines 5 fixed Indian coastal stations (Chennai, Mumbai, Visakhapatnam, Kochi, Bay of Bengal).
2. Computes the bounding box covering all stations.
3. Downloads sea temperature (thetao) from Copernicus Marine (July 2024, 0-50m depth).
4. Fetches Argo float profile data in the same region and time frame via argopy.
5. Converts both datasets into chunked Zarr format (.zarr) for fast random slice access in FastAPI.
6. Prints a detailed dataset summary.

RUN THIS MANUALLY ONCE:
    python data_fetch.py
================================================================================
"""

import os
import shutil
import sys
from pathlib import Path
import xarray as xr
import copernicusmarine
import argopy

# Ensure base directories exist
BASE_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = BASE_DIR / "output"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

OCEAN_ZARR_PATH = OUTPUT_DIR / "ocean_data.zarr"
ARGO_ZARR_PATH = OUTPUT_DIR / "argo_data.zarr"
TEMP_NC_PATH = OUTPUT_DIR / "temp_copernicus.nc"

# ==============================================================================
# 1. FIXED INDIAN COASTAL LOCATIONS
# ==============================================================================
# We define the 5 key observation points requested for Phase 1.
COASTAL_LOCATIONS = [
    {
        "id": "chennai",
        "name": "Chennai",
        "lat": 13.0827,
        "lon": 80.2707,
        "description": "Coromandel Coast (East Coast of India)"
    },
    {
        "id": "mumbai",
        "name": "Mumbai",
        "lat": 18.9220,
        "lon": 72.8347,
        "description": "Konkan Coast (West Coast of India)"
    },
    {
        "id": "visakhapatnam",
        "name": "Visakhapatnam",
        "lat": 17.6868,
        "lon": 83.2185,
        "description": "Andhra Coast (East Coast of India)"
    },
    {
        "id": "kochi",
        "name": "Kochi",
        "lat": 9.9312,
        "lon": 76.2673,
        "description": "Malabar Coast (South-West Coast of India)"
    },
    {
        "id": "bay_of_bengal",
        "name": "Bay of Bengal (Open Water)",
        "lat": 14.0000,
        "lon": 86.0000,
        "description": "Central Bay of Bengal Deep-Sea Reference"
    },
]

# Bounding box coordinates covering all 5 locations with comfortable ocean margin
BOUNDING_BOX = {
    "min_lon": 71.0,
    "max_lon": 88.0,
    "min_lat": 8.0,
    "max_lat": 20.0,
}

# Dynamically resolve available Copernicus observation date
# Copernicus product versions (e.g. 202406) must not be confused with observation dates.
from datetime import datetime, timedelta, date
from router import latest_available_iso

_latest_date_str = latest_available_iso()
_latest_dt = datetime.strptime(_latest_date_str, "%Y-%m-%d").date()
# Manageable recent window: past 7 days up to latest available date
_start_dt = _latest_dt - timedelta(days=7)
START_TIME = f"{_start_dt.isoformat()}T00:00:00"
END_TIME = f"{_latest_dt.isoformat()}T00:00:00"

# Depth bounds: 0 to 50 meters (upper ocean surface and mixed layer)
MIN_DEPTH = 0.49
MAX_DEPTH = 50.0

# Copernicus Dataset ID for Daily Physics Reanalysis (includes thetao: seawater temperature)
COPERNICUS_DATASET_ID = "cmems_mod_glo_phy_my_0.083deg_P1D-m"


def fetch_copernicus_ocean_data():
    """
    Step 1: Fetch Copernicus Marine sea surface & subsurface temperature (thetao).
    
    Downloads a NetCDF subset for the bounding box and converts it into a chunked
    Zarr store on disk (L2 layer).
    """
    print("\n" + "=" * 75)
    print("STEP 1: FETCHING COPERNICUS MARINE DATA (L3 Cold Origin)")
    print("=" * 75)
    print(f"Dataset ID   : {COPERNICUS_DATASET_ID}")
    print(f"Variable     : thetao (Potential Sea Water Temperature in °C)")
    print(f"Bounding Box : Lat [{BOUNDING_BOX['min_lat']}, {BOUNDING_BOX['max_lat']}], "
          f"Lon [{BOUNDING_BOX['min_lon']}, {BOUNDING_BOX['max_lon']}]")
    print(f"Time Range   : {START_TIME} to {END_TIME}")
    print(f"Depth Range  : {MIN_DEPTH}m to {MAX_DEPTH}m")
    print(f"Target Zarr  : {OCEAN_ZARR_PATH}")
    print("-" * 75)

    # 1. Download via copernicusmarine.subset()
    print("Connecting to Copernicus Marine Service...")
    try:
        copernicusmarine.subset(
            dataset_id=COPERNICUS_DATASET_ID,
            variables=["thetao"],
            minimum_longitude=BOUNDING_BOX["min_lon"],
            maximum_longitude=BOUNDING_BOX["max_lon"],
            minimum_latitude=BOUNDING_BOX["min_lat"],
            maximum_latitude=BOUNDING_BOX["max_lat"],
            start_datetime=START_TIME,
            end_datetime=END_TIME,
            minimum_depth=MIN_DEPTH,
            maximum_depth=MAX_DEPTH,
            output_filename=TEMP_NC_PATH.name,
            output_directory=str(OUTPUT_DIR),
            overwrite=True
        )
    except Exception as e:
        print(f"\n[ERROR] Failed to fetch Copernicus data: {e}")
        print("Note: If credentials are required, run: copernicusmarine login")
        raise e

    print("\nDownload complete. Opening NetCDF and converting to chunked Zarr...")
    
    # 2. Open with xarray
    # xarray represents multi-dimensional labeled ocean arrays (time x depth x lat x lon)
    ds = xr.open_dataset(TEMP_NC_PATH)

    # 3. Chunk the dataset for high-performance point slice reads in Zarr
    # Chunking by time: -1 (all days in one chunk per spatial cell) allows instant time-series reads!
    ds_chunked = ds.chunk({"time": -1, "latitude": 50, "longitude": 50})

    # 4. Remove previous Zarr directory if it exists
    if OCEAN_ZARR_PATH.exists():
        shutil.rmtree(OCEAN_ZARR_PATH)

    # 5. Write to Zarr store (L2)
    ds_chunked.to_zarr(OCEAN_ZARR_PATH, mode="w")
    ds.close()

    # Clean up temporary NetCDF file to save disk space
    if TEMP_NC_PATH.exists():
        TEMP_NC_PATH.unlink()

    print(f"--> Saved chunked Zarr store to: {OCEAN_ZARR_PATH}")

    # Verify that the Zarr store can be loaded
    verify_ds = xr.open_zarr(OCEAN_ZARR_PATH)
    print("\n[VERIFICATION] Ocean Zarr Store Summary:")
    print(f"  Dimensions : {dict(verify_ds.sizes)}")
    print(f"  Variables  : {list(verify_ds.data_vars)}")
    print(f"  Coordinates: {list(verify_ds.coords)}")
    verify_ds.close()


def fetch_argo_float_data():
    """
    Step 2: Fetch Argo Float in-situ profile data via argopy.
    
    Argo floats are autonomous profiling floats measuring ocean properties.
    Fetches float profiles in the bounding box and saves them to an L2 Zarr store.
    """
    print("\n" + "=" * 75)
    print("STEP 2: FETCHING ARGO FLOAT PROFILE DATA (L3 Cold Origin)")
    print("=" * 75)
    print(f"Region Box   : Lon [{BOUNDING_BOX['min_lon']}, {BOUNDING_BOX['max_lon']}], "
          f"Lat [{BOUNDING_BOX['min_lat']}, {BOUNDING_BOX['max_lat']}]")
    print(f"Time Range   : {_start_dt.isoformat()} to {_latest_dt.isoformat()}")
    print(f"Depth Range  : 0 to 50 dbar (meters)")
    print(f"Target Zarr  : {ARGO_ZARR_PATH}")
    print("-" * 75)

    print("Querying Argo ERDDAP servers via argopy...")
    try:
        fetcher = argopy.DataFetcher(mode="standard")
        # Region format: [min_lon, max_lon, min_lat, max_lat, min_depth, max_depth, start_date, end_date]
        argo_ds = fetcher.region([
            BOUNDING_BOX["min_lon"],
            BOUNDING_BOX["max_lon"],
            BOUNDING_BOX["min_lat"],
            BOUNDING_BOX["max_lat"],
            0,
            50,
            _start_dt.isoformat(),
            _latest_dt.isoformat()
        ]).to_xarray()
    except Exception as e:
        print(f"\n[ERROR] Failed to fetch Argo data: {e}")
        raise e

    print(f"Fetched {argo_ds.sizes.get('N_POINTS', 0)} Argo data observation points.")
    
    # Remove previous Zarr directory if it exists
    if ARGO_ZARR_PATH.exists():
        shutil.rmtree(ARGO_ZARR_PATH)

    # Save to Zarr store (L2)
    argo_ds.to_zarr(ARGO_ZARR_PATH, mode="w")
    print(f"--> Saved Argo Zarr store to: {ARGO_ZARR_PATH}")

    # Verify
    verify_argo = xr.open_zarr(ARGO_ZARR_PATH)
    print("\n[VERIFICATION] Argo Zarr Store Summary:")
    print(f"  Points     : {verify_argo.sizes.get('N_POINTS', 0)}")
    print(f"  Variables  : {list(verify_argo.data_vars)}")
    if "PLATFORM_NUMBER" in verify_argo:
        import numpy as np
        floats = np.unique(verify_argo["PLATFORM_NUMBER"].values)
        print(f"  Unique Floats: {floats.tolist()}")
    verify_argo.close()


def main():
    print("=" * 75)
    print("INCOIS OCEAN DATA INGESTION PIPELINE (PHASE 1 - L3 TO L2 PRE-PROCESS)")
    print("=" * 75)
    print("Fixed Indian Coastal Locations defined:")
    for loc in COASTAL_LOCATIONS:
        print(f"  - {loc['name']:25} | Lat: {loc['lat']:7.4f}°N | Lon: {loc['lon']:7.4f}°E | {loc['description']}")
    
    # 1. Fetch ocean model data
    fetch_copernicus_ocean_data()

    # 2. Fetch Argo float in-situ data
    fetch_argo_float_data()

    print("\n" + "=" * 75)
    print("DATA FETCH & PRE-PROCESSING COMPLETE!")
    print("Both L2 Zarr stores are ready in backend/output/:")
    print(f"  1. {OCEAN_ZARR_PATH}")
    print(f"  2. {ARGO_ZARR_PATH}")
    print("\nYou can now start the FastAPI server:")
    print("  uvicorn main:app --reload")
    print("=" * 75)


if __name__ == "__main__":
    main()
