"""
================================================================================
SIH26067 - INCOIS Ocean 3D Visualization Platform (Phase 2)
main.py — FastAPI Backend: Tiered Cache + Progressive WebSockets + 3D Map APIs
================================================================================

ARCHITECTURE:
  L1 Cache (RAM Dict)      : instant slice hits, <1 ms
  L2 Cache (Zarr on Disk)  : lazy-loaded chunks, 5-25 ms
  L3 Cold Origin           : Copernicus/Argo APIs, touched ONLY in data_fetch.py

NEW IN PHASE 2:
  - /api/ocean-tiles/{z}/{x}/{y}  : Map-tile style chunked ocean data (like Leaflet tiles)
  - /ws/ocean-stream              : Progressive chunk-by-chunk download via WebSocket
  - /api/argo-profiles            : Full Argo profiles grouped by platform with timestamps
  - /api/argo-slider              : Argo float positions filtered by datetime range
  - /api/files                    : List all downloaded/cached data files on disk
  - /api/aodn-data                : AODN CTD ocean profile addon integration
  - /api/ocean-overview           : Full bounding-box overview (min/max temp, currents)
================================================================================
"""

import time
import json
import asyncio
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
import numpy as np
import xarray as xr
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# ==============================================================================
# 1. SETUP & CONFIGURATION
# ==============================================================================
BASE_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = BASE_DIR / "output"
OCEAN_ZARR_PATH = OUTPUT_DIR / "ocean_data.zarr"
ARGO_ZARR_PATH = OUTPUT_DIR / "argo_data.zarr"

# Root-level data directories (for file listing)
ROOT_DIR = BASE_DIR.parent
OCEAN_DATA_DIR = ROOT_DIR / "ocean_data"
OCEAN_VIZ_DIR = ROOT_DIR / "ocean_visualizations"
AODN_DIR = ROOT_DIR / "aodn_output"

app = FastAPI(
    title="INCOIS Ocean 3D Platform API",
    description="Tiered Cache + Progressive Tile Streaming + Argo + AODN Integration",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==============================================================================
# 2. FIXED LOCATIONS & OCEAN BOUNDING BOX
# ==============================================================================
LOCATIONS: Dict[str, Dict[str, Any]] = {
    "chennai":        {"id": "chennai",        "name": "Chennai",                    "lat": 13.0827, "lon": 80.2707, "region": "Coromandel Coast"},
    "mumbai":         {"id": "mumbai",          "name": "Mumbai",                     "lat": 18.9220, "lon": 72.8347, "region": "Konkan Coast"},
    "visakhapatnam":  {"id": "visakhapatnam",   "name": "Visakhapatnam",              "lat": 17.6868, "lon": 83.2185, "region": "Andhra Coast"},
    "kochi":          {"id": "kochi",           "name": "Kochi",                      "lat":  9.9312, "lon": 76.2673, "region": "Malabar Coast"},
    "bay_of_bengal":  {"id": "bay_of_bengal",   "name": "Bay of Bengal (Open Water)", "lat": 14.0000, "lon": 86.0000, "region": "Central Bay of Bengal"},
}

# Indian Ocean coverage bounding box (matches data_fetch.py)
BBOX = {"min_lat": 8.0, "max_lat": 20.0, "min_lon": 71.0, "max_lon": 88.0}

# ==============================================================================
# 3. L1 IN-MEMORY CACHE & L2 ZARR DATASETS
# ==============================================================================
slice_cache: Dict[str, Any] = {}
tile_cache:  Dict[str, Any] = {}       # separate tile cache

cache_stats = {"l1_hits": 0, "l2_hits": 0, "total_requests": 0}

ocean_dataset: Optional[xr.Dataset] = None
argo_dataset:  Optional[xr.Dataset] = None


@app.on_event("startup")
def load_l2_datasets():
    global ocean_dataset, argo_dataset
    print("=" * 70)
    print("INITIALIZING L2 STORAGE LAYER (Zarr on Disk)")
    print("=" * 70)

    if OCEAN_ZARR_PATH.exists():
        try:
            ocean_dataset = xr.open_zarr(OCEAN_ZARR_PATH)
            print(f"[L2 OK] Ocean Zarr: {dict(ocean_dataset.sizes)}")
        except Exception as e:
            print(f"[WARN] Ocean Zarr open failed: {e}")

    if ARGO_ZARR_PATH.exists():
        try:
            argo_dataset = xr.open_zarr(ARGO_ZARR_PATH)
            print(f"[L2 OK] Argo Zarr: {argo_dataset.sizes.get('N_POINTS', 0)} pts")
        except Exception as e:
            print(f"[WARN] Argo Zarr open failed: {e}")

    print("=" * 70)


# ==============================================================================
# 4. HELPER UTILITIES
# ==============================================================================

def _lat_coord(ds: xr.Dataset) -> str:
    return "latitude" if "latitude" in ds.coords else "lat"

def _lon_coord(ds: xr.Dataset) -> str:
    return "longitude" if "longitude" in ds.coords else "lon"


def _ocean_point(ds: xr.Dataset, lat: float, lon: float) -> xr.Dataset:
    return ds.sel({_lat_coord(ds): lat, _lon_coord(ds): lon}, method="nearest")


def _safe_float(v) -> Optional[float]:
    try:
        f = float(v)
        return None if np.isnan(f) else round(f, 3)
    except Exception:
        return None


def _latlon_grid(ds: xr.Dataset) -> Tuple[np.ndarray, np.ndarray]:
    lats = ds[_lat_coord(ds)].values
    lons = ds[_lon_coord(ds)].values
    return lats, lons


# ==============================================================================
# 5. CORE CACHING LOGIC (L1 → L2 → Never L3)
# ==============================================================================

def get_coastal_series(loc_key: str, variable: str = "thetao") -> Dict[str, Any]:
    start = time.perf_counter()
    cache_stats["total_requests"] += 1

    loc_key = loc_key.strip().lower()
    if loc_key not in LOCATIONS:
        matched = next((k for k, v in LOCATIONS.items() if v["name"].lower() == loc_key), None)
        if not matched:
            raise HTTPException(404, f"Location '{loc_key}' not found.")
        loc_key = matched

    loc = LOCATIONS[loc_key]
    key = f"series:{loc_key}:{variable}"

    if key in slice_cache:
        cache_stats["l1_hits"] += 1
        return {**loc, "variable": variable, "data": slice_cache[key],
                "cache_layer": "L1_RAM", "cache_status": "HIT",
                "elapsed_ms": round((time.perf_counter() - start) * 1000, 3),
                "location": loc["name"], "location_id": loc_key}

    if ocean_dataset is None:
        raise HTTPException(503, "Ocean Zarr store not loaded.")

    cache_stats["l2_hits"] += 1
    try:
        pt = _ocean_point(ocean_dataset, loc["lat"], loc["lon"])
        if "depth" in pt.dims:
            pt = pt.isel(depth=0)
        times = pt["time"].values
        vals = pt[variable].values
        series = [{"date": np.datetime_as_string(t, unit="D"), "value": _safe_float(v)}
                  for t, v in zip(times, vals)]
        slice_cache[key] = series
        return {**loc, "variable": variable, "data": series,
                "cache_layer": "L2_ZARR", "cache_status": "MISS (Populated L1)",
                "elapsed_ms": round((time.perf_counter() - start) * 1000, 3),
                "location": loc["name"], "location_id": loc_key}
    except Exception as e:
        raise HTTPException(500, f"L2 slice error: {e}")


def get_depth_profile(loc_key: str, variable: str = "thetao") -> Dict[str, Any]:
    start = time.perf_counter()
    cache_stats["total_requests"] += 1
    loc_key = loc_key.strip().lower()
    if loc_key not in LOCATIONS:
        raise HTTPException(404, f"Location '{loc_key}' not found.")
    loc = LOCATIONS[loc_key]
    key = f"depth:{loc_key}:{variable}"

    if key in slice_cache:
        cache_stats["l1_hits"] += 1
        return {"location": loc["name"], "location_id": loc_key, "profile": slice_cache[key],
                "cache_layer": "L1_RAM", "cache_status": "HIT",
                "elapsed_ms": round((time.perf_counter() - start) * 1000, 3)}

    if ocean_dataset is None:
        raise HTTPException(503, "Ocean Zarr store not loaded.")
    cache_stats["l2_hits"] += 1
    try:
        pt = _ocean_point(ocean_dataset, loc["lat"], loc["lon"])
        depths = pt["depth"].values
        temps = pt[variable].isel(time=-1).values
        profile = [{"depth_m": round(float(d), 2), "temp_c": _safe_float(t)}
                   for d, t in zip(depths, temps)]
        slice_cache[key] = profile
        return {"location": loc["name"], "location_id": loc_key, "profile": profile,
                "cache_layer": "L2_ZARR", "cache_status": "MISS (Populated L1)",
                "elapsed_ms": round((time.perf_counter() - start) * 1000, 3)}
    except Exception as e:
        raise HTTPException(500, f"Depth profile error: {e}")


# ==============================================================================
# 6. REST ENDPOINTS — ORIGINAL
# ==============================================================================

@app.get("/")
def root():
    return {
        "project": "SIH26067 - INCOIS Ocean 3D Platform (Phase 2)",
        "status": "Online",
        "endpoints": {
            "GET /api/metadata":                 "Available dataset dimensions, dates, depths, variables & locations",
            "GET /api/coastal-temps":            "Temperature time-series for 5 coastal stations",
            "GET /api/depth-profile":            "Vertical water column profile (0–50m)",
            "GET /api/custom-point":             "Arbitrary coordinate deep-dive slice",
            "GET /api/argo-floats":              "Argo float profiles (up to 200 pts)",
            "GET /api/argo-slider":              "Argo positions filtered by date range",
            "GET /api/argo-profiles":            "Argo profiles grouped by platform_number",
            "GET /api/ocean-tiles/{z}/{x}/{y}":  "Map-tile-style chunked ocean data",
            "GET /api/ocean-overview":           "Full ocean grid overview stats",
            "GET /api/files":                    "List all downloaded data files on disk (?show_hidden=true for .zarr internals)",
            "GET /api/aodn-data":                "AODN CTD profile addon data",
            "GET /api/cache-stats":              "L1/L2 cache telemetry",
            "POST /api/cache-clear":             "Flush L1 in-memory cache",
            "WS /ws/coastal-temps":              "Progressive: preview → full → deep-dive",
            "WS /ws/ocean-stream":               "Chunked tile-by-tile ocean data stream",
        },
    }


@app.get("/api/coastal-temps")
def get_all_coastal_temps(variable: str = "thetao"):
    start = time.perf_counter()
    results, details = {}, {}
    for loc_key in LOCATIONS:
        info = get_coastal_series(loc_key, variable=variable)
        results[loc_key] = info["data"]
        details[loc_key] = {
            "location":    info["location"],
            "lat":         info["lat"],
            "lon":         info["lon"],
            "cache_layer": info["cache_layer"],
            "cache_status":info["cache_status"],
            "elapsed_ms":  info["elapsed_ms"],
        }
    return {
        "status": "success",
        "variable": variable,
        "unit": "°C",
        "total_elapsed_ms": round((time.perf_counter() - start) * 1000, 3),
        "stations": details,
        "data": results,
    }


@app.get("/api/depth-profile")
def get_coastal_depth_profile(location: str = "chennai", variable: str = "thetao"):
    return get_depth_profile(location, variable=variable)


@app.get("/api/custom-point")
def query_custom_point(lat: float, lon: float, variable: str = "thetao"):
    start = time.perf_counter()
    if ocean_dataset is None:
        raise HTTPException(503, "Ocean Zarr store not loaded.")
    try:
        pt = _ocean_point(ocean_dataset, lat, lon)
        mlat = _safe_float(pt[_lat_coord(ocean_dataset)].values)
        mlon = _safe_float(pt[_lon_coord(ocean_dataset)].values)
        surf = _safe_float(pt[variable].isel(time=-1, depth=0).values)
        deep = _safe_float(pt[variable].isel(time=-1, depth=-1).values)
        return {
            "status": "success",
            "requested_coords": {"lat": lat, "lon": lon},
            "nearest_grid_coords": {"lat": mlat, "lon": mlon},
            "latest_surface_temp_c": surf,
            "deepest_layer_temp_c": deep,
            "elapsed_ms": round((time.perf_counter() - start) * 1000, 3),
            "source": "L2_ZARR_SLICED",
        }
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/api/argo-floats")
def get_argo_floats(limit: int = Query(200, ge=1, le=2000)):
    start = time.perf_counter()
    if argo_dataset is None:
        raise HTTPException(503, "Argo Zarr not loaded. Run data_fetch.py first.")
    try:
        n = int(argo_dataset.sizes.get("N_POINTS", 0))
        if n == 0:
            return {"status": "success", "count": 0, "floats": []}

        lats  = argo_dataset["LATITUDE"].values
        lons  = argo_dataset["LONGITUDE"].values
        times = argo_dataset["TIME"].values
        pres  = argo_dataset["PRES"].values   if "PRES"            in argo_dataset else []
        temps = argo_dataset["TEMP"].values   if "TEMP"            in argo_dataset else []
        plats = argo_dataset["PLATFORM_NUMBER"].values if "PLATFORM_NUMBER" in argo_dataset else []

        cap = min(n, limit)
        floats = []
        for i in range(cap):
            floats.append({
                "platform_number": int(plats[i]) if len(plats) > i else None,
                "lat":             round(float(lats[i]), 4) if len(lats) > i else None,
                "lon":             round(float(lons[i]), 4) if len(lons) > i else None,
                "depth_dbar":      round(float(pres[i]),  1) if len(pres)  > i else None,
                "temp_c":          _safe_float(temps[i])     if len(temps) > i else None,
                "datetime":        str(times[i])[:19]         if len(times) > i else None,
            })

        return {
            "status": "success",
            "total_points_in_store": n,
            "returned_points": len(floats),
            "elapsed_ms": round((time.perf_counter() - start) * 1000, 3),
            "floats": floats,
        }
    except Exception as e:
        raise HTTPException(500, str(e))


# ==============================================================================
# 7. NEW: ARGO SLIDER ENDPOINT
# Returns Argo float positions filtered to a specific datetime window.
# Frontend time-slider calls this with date_start / date_end.
# ==============================================================================

@app.get("/api/argo-slider")
def argo_slider(
    date_start: str = Query("2024-07-01", description="ISO date, e.g. 2024-07-01"),
    date_end:   str = Query("2024-07-31", description="ISO date, e.g. 2024-07-31"),
    limit: int = Query(500, ge=1, le=5000),
):
    """
    Returns Argo float lat/lon/temp/depth filtered to the given date window.
    Frontend drives a time-slider to animate float movements across the month.
    """
    start = time.perf_counter()
    if argo_dataset is None:
        raise HTTPException(503, "Argo Zarr not loaded.")
    try:
        import pandas as pd
        t0 = np.datetime64(date_start)
        t1 = np.datetime64(date_end) + np.timedelta64(1, "D")

        times = argo_dataset["TIME"].values
        mask = (times >= t0) & (times < t1)
        idx = np.where(mask)[0][:limit]

        lats  = argo_dataset["LATITUDE"].values
        lons  = argo_dataset["LONGITUDE"].values
        pres  = argo_dataset["PRES"].values if "PRES" in argo_dataset else np.array([])
        temps = argo_dataset["TEMP"].values if "TEMP" in argo_dataset else np.array([])
        plats = argo_dataset["PLATFORM_NUMBER"].values if "PLATFORM_NUMBER" in argo_dataset else np.array([])

        floats = []
        for i in idx:
            floats.append({
                "platform_number": int(plats[i]) if len(plats) > i else None,
                "lat":             round(float(lats[i]), 4),
                "lon":             round(float(lons[i]), 4),
                "depth_dbar":      round(float(pres[i]),  1) if len(pres)  > i else None,
                "temp_c":          _safe_float(temps[i])     if len(temps) > i else None,
                "datetime":        str(times[i])[:19],
            })

        return {
            "status": "success",
            "date_start": date_start,
            "date_end": date_end,
            "total_matching": int(mask.sum()),
            "returned": len(floats),
            "elapsed_ms": round((time.perf_counter() - start) * 1000, 3),
            "floats": floats,
        }
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/api/argo-profiles")
def get_argo_profiles():
    """
    Returns unique Argo platform profiles grouped by platform_number,
    with their track (lat/lon sequence) and basic stats.
    """
    start = time.perf_counter()
    if argo_dataset is None:
        raise HTTPException(503, "Argo Zarr not loaded.")
    try:
        if "PLATFORM_NUMBER" not in argo_dataset:
            return {"status": "success", "platforms": []}

        lats  = argo_dataset["LATITUDE"].values
        lons  = argo_dataset["LONGITUDE"].values
        times = argo_dataset["TIME"].values
        plats = argo_dataset["PLATFORM_NUMBER"].values
        temps = argo_dataset["TEMP"].values if "TEMP" in argo_dataset else np.full(len(lats), np.nan)

        unique_platforms = np.unique(plats)
        profiles = []
        for pid in unique_platforms[:50]:            # cap at 50 floats
            mask = plats == pid
            pidx = np.where(mask)[0]
            track = []
            for i in pidx[:200]:                    # max 200 pts per float
                track.append({
                    "lat":      round(float(lats[i]),  4),
                    "lon":      round(float(lons[i]),  4),
                    "datetime": str(times[i])[:19],
                    "temp_c":   _safe_float(temps[i]),
                })
            profiles.append({
                "platform_number": int(pid),
                "observation_count": int(mask.sum()),
                "track": track,
            })

        return {
            "status": "success",
            "platform_count": len(profiles),
            "elapsed_ms": round((time.perf_counter() - start) * 1000, 3),
            "platforms": profiles,
        }
    except Exception as e:
        raise HTTPException(500, str(e))


# ==============================================================================
# 8. NEW: OCEAN MAP TILE ENDPOINT (Leaflet-style chunked data)
# GET /api/ocean-tiles/{z}/{x}/{y}?variable=thetao&time_idx=0
#
# The tile coordinate system divides the Indian Ocean bounding box:
#   z=0 : 1×1 tile covering the whole box
#   z=1 : 2×2 tiles
#   z=2 : 4×4 tiles
#   z=3 : 8×8 tiles   (etc.)
#
# Returns a grid of lat/lon/value points for that tile cell.
# ==============================================================================

@app.get("/api/ocean-tiles/{z}/{x}/{y}")
def get_ocean_tile(
    z: int,
    x: int,
    y: int,
    variable: str = Query("thetao"),
    time_idx: int = Query(-1, description="Time index; -1 = latest"),
    depth_idx: int = Query(0, description="Depth index; 0 = surface"),
):
    """
    Returns a sub-grid of ocean data for the requested tile cell.
    The frontend loads these progressively — coarse tiles first, then zooms in.
    Equivalent to Leaflet tiles but for ocean data instead of map images.
    """
    start = time.perf_counter()
    cache_key = f"tile:{z}:{x}:{y}:{variable}:{time_idx}:{depth_idx}"

    if cache_key in tile_cache:
        tile_cache[cache_key]["cache_layer"] = "L1_RAM"
        tile_cache[cache_key]["elapsed_ms"]  = round((time.perf_counter() - start) * 1000, 3)
        return tile_cache[cache_key]

    if ocean_dataset is None:
        raise HTTPException(503, "Ocean Zarr not loaded.")

    # --- Compute tile bounding box ---
    n_tiles = 2 ** z
    lat_span = BBOX["max_lat"] - BBOX["min_lat"]
    lon_span = BBOX["max_lon"] - BBOX["min_lon"]
    tile_lat  = lat_span / n_tiles
    tile_lon  = lon_span / n_tiles

    tile_min_lat = BBOX["min_lat"] + y * tile_lat
    tile_max_lat = tile_min_lat + tile_lat
    tile_min_lon = BBOX["min_lon"] + x * tile_lon
    tile_max_lon = tile_min_lon + tile_lon

    # Validate tile coordinates
    if x < 0 or x >= n_tiles or y < 0 or y >= n_tiles:
        raise HTTPException(400, f"Tile ({z}/{x}/{y}) out of range for zoom level {z}.")

    try:
        lc = _lat_coord(ocean_dataset)
        lnc = _lon_coord(ocean_dataset)

        # Slice this tile's lat/lon range from the Zarr store
        ds_tile = ocean_dataset.sel({
            lc:  slice(tile_min_lat, tile_max_lat),
            lnc: slice(tile_min_lon, tile_max_lon),
        })

        # Select time and depth
        ds_2d = ds_tile[variable].isel(time=time_idx, depth=depth_idx).values
        tile_lats = ds_tile[lc].values
        tile_lons = ds_tile[lnc].values

        # Build compact grid response
        grid = []
        for i, lat in enumerate(tile_lats):
            for j, lon in enumerate(tile_lons):
                v = _safe_float(ds_2d[i, j]) if ds_2d.ndim == 2 else None
                grid.append({"lat": round(float(lat), 4), "lon": round(float(lon), 4), "value": v})

        tile_time = ocean_dataset["time"].isel(time=time_idx).values
        tile_depth = ocean_dataset["depth"].isel(depth=depth_idx).values

        result = {
            "status": "success",
            "tile": {"z": z, "x": x, "y": y},
            "bbox": {
                "min_lat": round(tile_min_lat, 4),
                "max_lat": round(tile_max_lat, 4),
                "min_lon": round(tile_min_lon, 4),
                "max_lon": round(tile_max_lon, 4),
            },
            "variable": variable,
            "time": str(tile_time)[:19],
            "depth_m": round(float(tile_depth), 2),
            "grid_points": len(grid),
            "grid": grid,
            "cache_layer": "L2_ZARR",
            "elapsed_ms": round((time.perf_counter() - start) * 1000, 3),
        }
        tile_cache[cache_key] = result
        return result

    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/api/ocean-overview")
def get_ocean_overview(variable: str = "thetao", time_idx: int = -1, depth_idx: int = 0):
    """
    Returns a downsampled full-extent overview of the ocean grid.
    Used as the initial 'blurry' overview before zoomed tiles are loaded.
    """
    start = time.perf_counter()
    key = f"overview:{variable}:{time_idx}:{depth_idx}"

    if key in slice_cache:
        return {**slice_cache[key], "cache_layer": "L1_RAM",
                "elapsed_ms": round((time.perf_counter() - start) * 1000, 3)}

    if ocean_dataset is None:
        raise HTTPException(503, "Ocean Zarr not loaded.")

    try:
        data_2d = ocean_dataset[variable].isel(time=time_idx, depth=depth_idx).values
        lats = ocean_dataset[_lat_coord(ocean_dataset)].values
        lons = ocean_dataset[_lon_coord(ocean_dataset)].values

        # Downsample — take every 4th point for overview
        step = 4
        grid = []
        for i in range(0, len(lats), step):
            for j in range(0, len(lons), step):
                v = _safe_float(data_2d[i, j]) if data_2d.ndim == 2 else None
                grid.append({"lat": round(float(lats[i]), 3),
                              "lon": round(float(lons[j]), 3),
                              "value": v})

        # Stats
        valid = [p["value"] for p in grid if p["value"] is not None]
        stats = {
            "min": round(min(valid), 2) if valid else None,
            "max": round(max(valid), 2) if valid else None,
            "mean": round(float(np.mean(valid)), 2) if valid else None,
        }

        time_val = ocean_dataset["time"].isel(time=time_idx).values
        depth_val = ocean_dataset["depth"].isel(depth=depth_idx).values

        result = {
            "status": "success",
            "variable": variable,
            "time": str(time_val)[:19],
            "depth_m": round(float(depth_val), 2),
            "bbox": BBOX,
            "stats": stats,
            "grid_points": len(grid),
            "grid": grid,
            "cache_layer": "L2_ZARR",
            "elapsed_ms": round((time.perf_counter() - start) * 1000, 3),
        }
        slice_cache[key] = result
        return result

    except Exception as e:
        raise HTTPException(500, str(e))


# ==============================================================================
# 9. NEW: FILE LISTING ENDPOINT
# Shows all downloaded/cached files on disk — files are NEVER deleted.
# ==============================================================================

@app.get("/api/files")
def list_data_files(show_hidden: bool = Query(False, description="Show hidden/internal files (.zarr chunks, dot-files)")):
    """
    Lists all data files present on disk across all data directories.
    Files are NEVER deleted — this endpoint gives full visibility.
    When show_hidden=True, includes .zarr chunk files and dot-files.
    """
    directories = {
        "ocean_data":           OCEAN_DATA_DIR,
        "ocean_visualizations": OCEAN_VIZ_DIR,
        "aodn_output":          AODN_DIR,
        "backend_output":       OUTPUT_DIR,
    }

    result = {}
    total_bytes = 0

    for label, directory in directories.items():
        files_in_dir = []
        if directory.exists():
            for f in sorted(directory.rglob("*")):
                if f.is_file():
                    # Skip hidden/internal files unless show_hidden is True
                    rel = str(f.relative_to(directory))
                    is_hidden = any(part.startswith(".") for part in f.parts) or \
                                ".zarr" in rel
                    if is_hidden and not show_hidden:
                        continue

                    size = f.stat().st_size
                    total_bytes += size
                    files_in_dir.append({
                        "name": f.name,
                        "path": str(f.relative_to(ROOT_DIR)),
                        "size_bytes": size,
                        "size_mb": round(size / (1024 * 1024), 3),
                        "modified": f.stat().st_mtime,
                        "hidden": is_hidden,
                    })
        # Also count zarr directories as summary entries when not showing hidden
        zarr_dirs = []
        if directory.exists():
            for d in sorted(directory.iterdir()):
                if d.is_dir() and d.suffix == ".zarr":
                    zarr_size = sum(ff.stat().st_size for ff in d.rglob("*") if ff.is_file())
                    zarr_count = sum(1 for ff in d.rglob("*") if ff.is_file())
                    if not show_hidden:
                        total_bytes += zarr_size
                        files_in_dir.append({
                            "name": d.name,
                            "path": str(d.relative_to(ROOT_DIR)),
                            "size_bytes": zarr_size,
                            "size_mb": round(zarr_size / (1024 * 1024), 3),
                            "modified": d.stat().st_mtime,
                            "hidden": False,
                            "is_zarr_store": True,
                            "zarr_chunk_count": zarr_count,
                        })

        result[label] = {
            "path": str(directory),
            "exists": directory.exists(),
            "files": files_in_dir,
            "file_count": len(files_in_dir),
        }

    return {
        "status": "success",
        "show_hidden": show_hidden,
        "total_size_mb": round(total_bytes / (1024 * 1024), 2),
        "directories": result,
    }


# ==============================================================================
# 10. NEW: AODN CTD PROFILE ADDON
# Reads AODN NetCDF file and returns CTD profile data.
# ==============================================================================

@app.get("/api/aodn-data")
def get_aodn_data():
    """
    Returns AODN CTD profile data from the aodn_output directory.
    This is the AODN addon integrated from new.py.
    """
    nc_file = AODN_DIR / "aodn_subset.nc"

    if not nc_file.exists():
        # Return metadata about what needs to be done
        return {
            "status": "not_available",
            "message": "AODN CTD data not yet downloaded. Run new.py to fetch AODN data.",
            "source": "IMOS/ANMN/QLD/PIL100 CTD Timeseries",
            "variables": ["TEMP", "PSAL", "DEPTH", "PRES_REL"],
            "time_range": "2012-02-20 to 2012-08-20",
            "location": {"lat": -19.25, "lon": 147.05, "name": "PIL100 Station (Coral Sea)"},
        }

    try:
        ds = xr.open_dataset(nc_file, engine="netcdf4")
        profile = []

        has_temp  = "TEMP"  in ds
        has_psal  = "PSAL"  in ds
        has_depth = "DEPTH" in ds

        if has_depth:
            depths = ds["DEPTH"].values
            n = min(len(depths), 500)
            for i in range(n):
                entry = {"depth_m": _safe_float(depths[i])}
                if has_temp:
                    entry["temp_c"] = _safe_float(ds["TEMP"].values[i])
                if has_psal:
                    entry["salinity_psu"] = _safe_float(ds["PSAL"].values[i])
                profile.append(entry)

        meta = {
            "variables": list(ds.data_vars),
            "time_range": {
                "start": str(ds["TIME"].values[0])[:19] if "TIME" in ds else None,
                "end":   str(ds["TIME"].values[-1])[:19] if "TIME" in ds else None,
            },
        }
        ds.close()

        return {
            "status": "success",
            "source": "AODN/IMOS CTD Timeseries (PIL100)",
            "location": {"lat": -19.25, "lon": 147.05, "name": "PIL100 Station (Coral Sea)"},
            "metadata": meta,
            "profile_points": len(profile),
            "profile": profile,
        }
    except Exception as e:
        return {"status": "error", "error": str(e)}


@app.get("/api/metadata")
def get_metadata():
    """
    Returns available dataset dimensions, dates, depths, variables & locations metadata.
    Used by frontend to populate time/depth/variable pickers dynamically.
    """
    if ocean_dataset is None:
        return {"status": "not_loaded", "message": "Ocean Zarr dataset not loaded."}
    
    times = [str(t)[:10] for t in ocean_dataset["time"].values] if "time" in ocean_dataset else []
    depths = [round(float(d), 2) for d in ocean_dataset["depth"].values] if "depth" in ocean_dataset else []
    variables = list(ocean_dataset.data_vars)
    
    return {
        "status": "success",
        "dates": times,
        "depths": depths,
        "variables": variables,
        "locations": list(LOCATIONS.values()),
        "bbox": BBOX,
        "sizes": {k: int(v) for k, v in ocean_dataset.sizes.items()},
    }


@app.get("/api/cache-stats")
def get_cache_stats():
    total = cache_stats["total_requests"]
    rate = (cache_stats["l1_hits"] / total * 100.0) if total > 0 else 0.0
    return {
        "l1_hits":        cache_stats["l1_hits"],
        "l2_hits":        cache_stats["l2_hits"],
        "total_requests": total,
        "l1_hit_rate_pct": round(rate, 1),
        "slice_cache_keys": list(slice_cache.keys()),
        "tile_cache_keys":  list(tile_cache.keys())[:20],
    }


@app.post("/api/cache-clear")
def clear_l1_cache():
    slice_cache.clear()
    tile_cache.clear()
    return {"status": "cleared", "message": "L1 in-memory cache flushed."}



# ==============================================================================
# 11. WEBSOCKET: ORIGINAL PROGRESSIVE COASTAL TEMPS
# ==============================================================================

@app.websocket("/ws/coastal-temps")
async def websocket_coastal_temps(websocket: WebSocket):
    """
    Multi-stage progressive streaming:
      Stage 1: Low-res preview (last 5 pts)
      Stage 2: Full surface timeline
      Stage 3: Deep-dive vertical water column (thermocline)
    """
    await websocket.accept()
    try:
        while True:
            message = await websocket.receive_json()
            loc_key = message.get("location", "chennai")
            t0 = time.perf_counter()

            series = get_coastal_series(loc_key, variable="thetao")
            all_pts = series["data"]

            # Stage 1 — Preview
            preview = all_pts[-5:] if len(all_pts) >= 5 else all_pts
            await websocket.send_json({
                "stage": "preview",
                "title": "Low-Resolution Preview (Last 5 Points)",
                "location": series["location"],
                "location_id": series["location_id"],
                "cache_layer": series["cache_layer"],
                "count": len(preview),
                "total_available": len(all_pts),
                "elapsed_ms": round((time.perf_counter() - t0) * 1000, 3),
                "timestamp": time.time(),
                "data": preview,
            })

            # Stage 2 — Full
            await websocket.send_json({
                "stage": "full",
                "title": "Full Resolution Dataset (Surface Series)",
                "location": series["location"],
                "location_id": series["location_id"],
                "cache_layer": series["cache_layer"],
                "count": len(all_pts),
                "elapsed_ms": round((time.perf_counter() - t0) * 1000, 3),
                "timestamp": time.time(),
                "data": all_pts,
            })

            # Stage 3 — Deep-dive
            profile = get_depth_profile(loc_key, variable="thetao")
            await websocket.send_json({
                "stage": "deep_dive",
                "title": "Ocean Deep-Dive (Vertical Depth Profile 0–50m)",
                "location": series["location"],
                "location_id": series["location_id"],
                "cache_layer": profile["cache_layer"],
                "depth_layers_count": len(profile["profile"]),
                "elapsed_ms": round((time.perf_counter() - t0) * 1000, 3),
                "timestamp": time.time(),
                "profile": profile["profile"],
            })

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({"stage": "error", "error": str(e)})
        except Exception:
            pass


# ==============================================================================
# 12. NEW WEBSOCKET: CHUNKED OCEAN TILE STREAM
# Client sends {"variable":"thetao","zoom":2,"time_idx":-1}
# Server streams all tiles for that zoom level one-by-one.
# Client renders each tile as it arrives (no re-download from scratch).
# ==============================================================================

@app.websocket("/ws/ocean-stream")
async def websocket_ocean_stream(websocket: WebSocket):
    """
    Tile-by-tile progressive ocean data stream.
    Sends tiles Z=0 (full overview) → Z=1 (4 tiles) → Z=2 (16 tiles) progressively.
    Client draws each tile as soon as it arrives, building detail incrementally.
    Already-cached tiles are sent instantly from L1.
    If client requests a specific region, only tiles in that region are sent.
    """
    await websocket.accept()
    try:
        while True:
            msg = await websocket.receive_json()
            variable  = msg.get("variable",  "thetao")
            max_zoom  = min(int(msg.get("zoom", 2)), 4)    # max 4 for sanity
            time_idx  = int(msg.get("time_idx", -1))
            depth_idx = int(msg.get("depth_idx", 0))

            # Optional viewport filter (like Leaflet viewport bounds)
            vp_min_lat = msg.get("vp_min_lat", BBOX["min_lat"])
            vp_max_lat = msg.get("vp_max_lat", BBOX["max_lat"])
            vp_min_lon = msg.get("vp_min_lon", BBOX["min_lon"])
            vp_max_lon = msg.get("vp_max_lon", BBOX["max_lon"])

            stream_start = time.perf_counter()

            # Announce the stream
            await websocket.send_json({
                "type": "stream_start",
                "variable": variable,
                "max_zoom": max_zoom,
                "time_idx": time_idx,
                "depth_idx": depth_idx,
                "timestamp": time.time(),
            })

            # Stream from coarse to fine
            for z in range(max_zoom + 1):
                n_tiles = 2 ** z

                for x in range(n_tiles):
                    for y in range(n_tiles):
                        # Compute tile bbox to check viewport overlap
                        tile_min_lat = BBOX["min_lat"] + y * (BBOX["max_lat"] - BBOX["min_lat"]) / n_tiles
                        tile_max_lat = tile_min_lat +       (BBOX["max_lat"] - BBOX["min_lat"]) / n_tiles
                        tile_min_lon = BBOX["min_lon"] + x * (BBOX["max_lon"] - BBOX["min_lon"]) / n_tiles
                        tile_max_lon = tile_min_lon +       (BBOX["max_lon"] - BBOX["min_lon"]) / n_tiles

                        # Skip tiles outside viewport
                        if (tile_max_lat < vp_min_lat or tile_min_lat > vp_max_lat or
                            tile_max_lon < vp_min_lon or tile_min_lon > vp_max_lon):
                            continue

                        try:
                            tile = get_ocean_tile(z, x, y, variable=variable,
                                                  time_idx=time_idx, depth_idx=depth_idx)
                            await websocket.send_json({
                                "type":    "tile",
                                "z": z, "x": x, "y": y,
                                "variable":    variable,
                                "bbox":        tile["bbox"],
                                "time":        tile["time"],
                                "depth_m":     tile["depth_m"],
                                "grid_points": tile["grid_points"],
                                "grid":        tile["grid"],
                                "cache_layer": tile["cache_layer"],
                                "elapsed_ms":  tile["elapsed_ms"],
                                "stream_elapsed_ms": round((time.perf_counter() - stream_start) * 1000, 3),
                            })
                            # Small yield so client gets each tile incrementally
                            await asyncio.sleep(0.01)
                        except HTTPException:
                            pass  # Skip unavailable tiles

            await websocket.send_json({
                "type": "stream_complete",
                "total_elapsed_ms": round((time.perf_counter() - stream_start) * 1000, 3),
            })

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({"type": "error", "error": str(e)})
        except Exception:
            pass


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
