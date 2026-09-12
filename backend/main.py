"""
main.py — oceanStream backend API v3
=====================================

New endpoint groups (v3):
  /ocean/point       — click-to-query: cached physics + BGC + nearest Argo float
  /ocean/snapshot    — bbox + depth + date → grid payload
  /ocean/timeline    — time series at a point/region, powers all charts
  /ocean/coverage    — page-table state (debug/visualisation)
  /argo/nearest      — floats near a clicked point
  /argo/profile      — depth-ordered profile with BGC fields

Legacy endpoints preserved:
  /api/coastal-temps, /api/depth-profile, /api/custom-point,
  /api/argo-floats, /api/argo-profiles, /api/argo-slider,
  /api/ocean-tiles, /api/ocean-overview, /api/aodn-data,
  /api/cache-stats, /api/cache-clear, /ws/coastal-temps, /ws/ocean-stream
"""

import asyncio
import logging
import math
import os
import time
from datetime import date as _date, datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import xarray as xr
from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# ---------------------------------------------------------------------------
# Env / dotenv
# ---------------------------------------------------------------------------
try:
    import dotenv
    _env_path = Path(__file__).resolve().parent.parent / ".env"
    if _env_path.exists():
        dotenv.load_dotenv(_env_path)
except Exception:
    pass

# ---------------------------------------------------------------------------
# Internal modules
# ---------------------------------------------------------------------------
from page_table import (
    PageTable, PageState,
    depth_buckets_in_range, lat_buckets_in_range, lon_buckets_in_range,
    DEPTH_BIN_M, LAT_BIN_DEG, LON_BIN_DEG,
    date_bucket_for, iter_date_buckets,
)
import fetcher as _fetcher
import argo as _argo
from router import (
    phy_dataset, bgc_dataset, route_info, today_iso, yesterday_iso,
    resolve_date_input, resolve_date_range, latest_available_iso,
    PHY_VARIABLES, BGC_VARIABLES, resolve_variables, date_info,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")
logger = logging.getLogger("main")

# ==============================================================================
# Paths
# ==============================================================================
BASE_DIR       = Path(__file__).resolve().parent
OUTPUT_DIR     = BASE_DIR / "output"
PHY_ZARR_PATH  = OUTPUT_DIR / "phy_data.zarr"
BGC_ZARR_PATH  = OUTPUT_DIR / "bgc_data.zarr"
OCEAN_ZARR_PATH = OUTPUT_DIR / "ocean_data.zarr"   # legacy compat
ARGO_ZARR_PATH  = OUTPUT_DIR / "argo_data.zarr"

ROOT_DIR       = BASE_DIR.parent
AODN_DIR       = ROOT_DIR / "aodn_output"

# ==============================================================================
# App
# ==============================================================================
app = FastAPI(
    title="oceanStream API",
    description=(
        "Tiered-caching ocean data API with date-routed Copernicus datasets, "
        "Argo float integration, and progressive WebSocket streaming."
    ),
    version="3.0.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

# ==============================================================================
# L1 in-memory cache  (key → {data, ts})
# ==============================================================================
L1_TTL_SECONDS = 300   # 5-minute TTL
_l1: Dict[str, Dict] = {}

def l1_get(key: str) -> Optional[Any]:
    entry = _l1.get(key)
    if entry and (time.time() - entry["ts"]) < L1_TTL_SECONDS:
        return entry["data"]
    return None

def l1_set(key: str, data: Any) -> None:
    _l1[key] = {"data": data, "ts": time.time()}

def l1_clear() -> int:
    n = len(_l1)
    _l1.clear()
    return n

# ==============================================================================
# L2 zarr datasets (loaded at startup)
# ==============================================================================
phy_dataset_xr:    Optional[xr.Dataset] = None
bgc_dataset_xr:    Optional[xr.Dataset] = None
ocean_dataset_xr:  Optional[xr.Dataset] = None   # legacy fallback
argo_dataset_xr:   Optional[xr.Dataset] = None

cache_stats = {"l1_hits": 0, "l2_hits": 0, "fetches": 0, "total_requests": 0}

# ==============================================================================
# Page table
# ==============================================================================
ZARR_CAP_BYTES = int(os.environ.get("ZARR_CAP_BYTES", str(4 * 1024 ** 3)))  # 4 GB
page_table = PageTable(cap_bytes=ZARR_CAP_BYTES)

# In-flight fetch tasks (page_key → asyncio.Task)
_fetch_tasks: Dict[str, asyncio.Task] = {}

# Fixed coastal stations (kept for legacy endpoints)
LOCATIONS: Dict[str, Dict] = {
    "chennai":       {"id": "chennai",       "name": "Chennai",                    "lat": 13.0827, "lon": 80.2707},
    "mumbai":        {"id": "mumbai",         "name": "Mumbai",                     "lat": 18.9220, "lon": 72.8347},
    "visakhapatnam": {"id": "visakhapatnam", "name": "Visakhapatnam",              "lat": 17.6868, "lon": 83.2185},
    "kochi":         {"id": "kochi",          "name": "Kochi",                      "lat":  9.9312, "lon": 76.2673},
    "bay_of_bengal": {"id": "bay_of_bengal", "name": "Bay of Bengal (Open Water)", "lat": 14.0000, "lon": 86.0000},
}

BBOX = {"min_lat": 8.0, "max_lat": 22.0, "min_lon": 68.0, "max_lon": 90.0}


# ==============================================================================
# Startup
# ==============================================================================

def _lat_coord(ds: xr.Dataset) -> str:
    return "latitude" if "latitude" in ds.coords else "lat"

def _lon_coord(ds: xr.Dataset) -> str:
    return "longitude" if "longitude" in ds.coords else "lon"

def _safe_float(v) -> Optional[float]:
    try:
        f = float(v)
        return None if (math.isnan(f) or math.isinf(f)) else round(f, 4)
    except Exception:
        return None

def _populate_page_table(ds: xr.Dataset, zarr_path: Path):
    try:
        lc, lnc = _lat_coord(ds), _lon_coord(ds)
        lats   = ds[lc].values
        lons   = ds[lnc].values
        depths = ds["depth"].values if "depth" in ds.coords else [0.0]
        times  = ds["time"].values  if "time"  in ds.coords else []

        zarr_size = sum(f.stat().st_size for f in zarr_path.rglob("*") if f.is_file()) if zarr_path.exists() else 0
        lat_bs   = {int(math.floor(float(la) / LAT_BIN_DEG))   for la in lats}
        lon_bs   = {int(math.floor(float(lo) / LON_BIN_DEG))   for lo in lons}
        depth_bs = {int(math.floor(float(d)  / DEPTH_BIN_M))   for d  in depths}
        time_bs  = {str(t)[:10] for t in times} if len(times) > 0 else {today_iso()}

        n_pages = max(1, len(lat_bs) * len(lon_bs) * len(depth_bs) * len(time_bs))
        per_page = zarr_size // n_pages
        for lb in lat_bs:
            for ln in lon_bs:
                for db in depth_bs:
                    for tb in time_bs:
                        page_table.register_on_disk(lb, ln, db, tb, per_page)
        logger.info(f"[PageTable] Registered {n_pages} ON_DISK pages from {zarr_path.name}")
    except Exception as e:
        logger.warning(f"[PageTable] Pre-populate failed for {zarr_path.name}: {e}")


@app.on_event("startup")
def load_datasets():
    global phy_dataset_xr, bgc_dataset_xr, ocean_dataset_xr, argo_dataset_xr
    logger.info("=" * 60)
    logger.info("Initialising L2 storage layer (Zarr)")

    for path, attr_name, label in [
        (PHY_ZARR_PATH,   "phy_dataset_xr",   "Physics"),
        (BGC_ZARR_PATH,   "bgc_dataset_xr",   "BGC"),
        (OCEAN_ZARR_PATH, "ocean_dataset_xr",  "Legacy ocean"),
        (ARGO_ZARR_PATH,  "argo_dataset_xr",   "Argo"),
    ]:
        if path.exists():
            try:
                ds = xr.open_zarr(path)
                globals()[attr_name] = ds
                logger.info(f"[L2 OK] {label} zarr: {dict(ds.sizes)}")
                if attr_name in ("phy_dataset_xr", "ocean_dataset_xr"):
                    _populate_page_table(ds, path)
            except Exception as e:
                logger.warning(f"[L2 WARN] {label} zarr open failed: {e}")
        else:
            logger.info(f"[L2] {label} zarr not found at {path} (will fetch on demand)")

    logger.info("=" * 60)


# ==============================================================================
# Zarr slice helpers
# ==============================================================================

def _select_point(ds: xr.Dataset, lat: float, lon: float) -> xr.Dataset:
    return ds.sel({_lat_coord(ds): lat, _lon_coord(ds): lon}, method="nearest")


def _read_phy_point(lat: float, lon: float, depth: float, date_str: str) -> Dict:
    """Read physics variables from L2 zarr at nearest grid point."""
    ds = phy_dataset_xr or ocean_dataset_xr
    if ds is None:
        return {}
    try:
        pt = _select_point(ds, lat, lon)
        # Select nearest depth
        if "depth" in pt.dims:
            pt = pt.sel(depth=depth, method="nearest")
        # Select nearest time
        if "time" in pt.dims:
            target = np.datetime64(date_str)
            pt = pt.sel(time=target, method="nearest")

        result: Dict[str, Any] = {}
        var_map = {
            "thetao": "temperature_c",
            "so":     "salinity_psu",
            "uo":     "current_u_ms",
            "vo":     "current_v_ms",
            "zos":    "sea_level_m",
        }
        for src, dst in var_map.items():
            if src in pt:
                result[dst] = _safe_float(pt[src].values)
        return result
    except Exception as e:
        logger.debug(f"[L2 phy] point read failed: {e}")
        return {}


def _read_bgc_point(lat: float, lon: float, depth: float, date_str: str) -> Dict:
    """Read BGC variables from L2 zarr at nearest grid point."""
    if bgc_dataset_xr is None:
        return {}
    try:
        pt = _select_point(bgc_dataset_xr, lat, lon)
        if "depth" in pt.dims:
            pt = pt.sel(depth=depth, method="nearest")
        if "time" in pt.dims:
            target = np.datetime64(date_str)
            pt = pt.sel(time=target, method="nearest")

        result: Dict[str, Any] = {}
        var_map = {
            "chl":   "chlorophyll_mgl",
            "no3":   "nitrate_mmolm3",
            "po4":   "phosphate_mmolm3",
            "si":    "silicate_mmolm3",
            "o2":    "oxygen_mmolm3",
            "ph":    "ph",
            "spco2": "pco2_uatm",
        }
        for src, dst in var_map.items():
            if src in pt:
                result[dst] = _safe_float(pt[src].values)
        return result
    except Exception as e:
        logger.debug(f"[L2 bgc] point read failed: {e}")
        return {}


def _read_phy_grid(
    lat_min: float, lat_max: float,
    lon_min: float, lon_max: float,
    depth: float, date_str: str,
) -> List[Dict]:
    """Return a grid of physics values in a bbox using fast vectorized numpy indexing."""
    ds = phy_dataset_xr or ocean_dataset_xr
    if ds is None:
        return []
    try:
        lc, lnc = _lat_coord(ds), _lon_coord(ds)
        region = ds.sel(
            {lc: slice(lat_min, lat_max), lnc: slice(lon_min, lon_max)}
        )
        if "depth" in region.dims:
            region = region.sel(depth=depth, method="nearest")
        if "time" in region.dims:
            region = region.sel(time=np.datetime64(date_str), method="nearest")

        lats = region[lc].values
        lons = region[lnc].values

        if len(lats) == 0 or len(lons) == 0:
            return []

        var_data = {}
        for src, dst in [("thetao","temperature_c"),("so","salinity_psu"),
                          ("uo","current_u_ms"),("vo","current_v_ms"),("zos","sea_level_m")]:
            if src in region:
                arr = region[src].values
                while arr.ndim > 2:
                    arr = arr[0]
                var_data[dst] = arr

        rows = []
        for i, la in enumerate(lats):
            lat_val = round(float(la), 4)
            for j, lo in enumerate(lons):
                row = {"lat": lat_val, "lon": round(float(lo), 4)}
                for dst, arr in var_data.items():
                    if i < arr.shape[0] and j < arr.shape[1]:
                        row[dst] = _safe_float(arr[i, j])
                rows.append(row)
        return rows
    except Exception as e:
        logger.debug(f"[L2 grid] read failed: {e}")
        return []


def _read_timeline(
    lat: float, lon: float,
    depth: float,
    date_start: str, date_end: str,
    granularity: str,
    variables: List[str],
) -> List[Dict]:
    """Read time-series at a point, aggregated by granularity."""
    resolved = resolve_variables(variables)
    phy_vars = resolved["phy"]
    bgc_vars = resolved["bgc"]

    ds_phy = phy_dataset_xr or ocean_dataset_xr
    ds_bgc = bgc_dataset_xr

    series: Dict[str, Dict] = {}  # bucket → {var: value}

    if ds_phy and phy_vars:
        try:
            pt = _select_point(ds_phy, lat, lon)
            if "depth" in pt.dims:
                pt = pt.sel(depth=depth, method="nearest")
            t0 = np.datetime64(date_start)
            t1 = np.datetime64(date_end)
            if "time" in pt.dims:
                pt = pt.sel(time=slice(t0, t1))
            times = pt["time"].values if "time" in pt.coords else []
            for i, t in enumerate(times):
                bkt = date_bucket_for(str(t)[:10], granularity)
                if bkt not in series:
                    series[bkt] = {"date": bkt}
                for v in phy_vars:
                    if v in pt:
                        val = _safe_float(pt[v].values[i] if hasattr(pt[v].values, '__len__') else pt[v].values)
                        # Aggregate: simple mean (for groupby-like behaviour)
                        alias = {"thetao":"temperature_c","so":"salinity_psu",
                                 "uo":"current_u_ms","vo":"current_v_ms","zos":"sea_level_m"}.get(v, v)
                        if alias not in series[bkt]:
                            series[bkt][alias] = []
                        if isinstance(series[bkt][alias], list):
                            series[bkt][alias].append(val)
        except Exception as e:
            logger.debug(f"[timeline phy] {e}")

    if ds_bgc and bgc_vars:
        try:
            pt = _select_point(ds_bgc, lat, lon)
            if "depth" in pt.dims:
                pt = pt.sel(depth=depth, method="nearest")
            t0 = np.datetime64(date_start)
            t1 = np.datetime64(date_end)
            if "time" in pt.dims:
                pt = pt.sel(time=slice(t0, t1))
            times = pt["time"].values if "time" in pt.coords else []
            for i, t in enumerate(times):
                bkt = date_bucket_for(str(t)[:10], granularity)
                if bkt not in series:
                    series[bkt] = {"date": bkt}
                for v in bgc_vars:
                    if v in pt:
                        val = _safe_float(pt[v].values[i] if hasattr(pt[v].values, '__len__') else pt[v].values)
                        alias = {"chl":"chlorophyll_mgl","no3":"nitrate_mmolm3","po4":"phosphate_mmolm3",
                                 "si":"silicate_mmolm3","o2":"oxygen_mmolm3","ph":"ph","spco2":"pco2_uatm"}.get(v, v)
                        if alias not in series[bkt]:
                            series[bkt][alias] = []
                        if isinstance(series[bkt][alias], list):
                            series[bkt][alias].append(val)
        except Exception as e:
            logger.debug(f"[timeline bgc] {e}")

    # Average collected lists
    result = []
    for bkt in sorted(series.keys()):
        row = {"date": bkt}
        for k, v in series[bkt].items():
            if k == "date":
                continue
            if isinstance(v, list):
                valid = [x for x in v if x is not None]
                row[k] = round(sum(valid) / len(valid), 4) if valid else None
            else:
                row[k] = v
        result.append(row)
    return result


# ==============================================================================
# Background fetch + prefetch
# ==============================================================================

async def _bg_fetch_point(page_key: str, lat: float, lon: float, depth: float, date_str: str):
    """Background task: fetch PHY+BGC for a point, update page table + L1."""
    try:
        cache_stats["fetches"] += 1
        lat_b  = int(math.floor(lat / LAT_BIN_DEG))
        lon_b  = int(math.floor(lon / LON_BIN_DEG))
        depth_b = int(math.floor(depth / DEPTH_BIN_M))

        served, missing = page_table.diff(
            lat - LAT_BIN_DEG, lat + LAT_BIN_DEG,
            lon - LON_BIN_DEG, lon + LON_BIN_DEG,
            max(0, depth - DEPTH_BIN_M), depth + DEPTH_BIN_M,
            date_str,
        )
        if missing:
            page_table.mark_fetching(missing)

        await _fetcher.fetch_point(lat, lon, depth, date_str,
                                   page_table=page_table, missing_pages=missing)

        # Reload zarr and populate L1
        global phy_dataset_xr, bgc_dataset_xr
        if _fetcher.PHY_ZARR_PATH.exists():
            phy_dataset_xr = xr.open_zarr(_fetcher.PHY_ZARR_PATH)
        if _fetcher.BGC_ZARR_PATH.exists():
            bgc_dataset_xr = xr.open_zarr(_fetcher.BGC_ZARR_PATH)

        phy_data = _read_phy_point(lat, lon, depth, date_str)
        bgc_data = _read_bgc_point(lat, lon, depth, date_str)
        l1_set(page_key, {"physics": phy_data, "bgc": bgc_data})
        page_table.promote(page_key)
        logger.info(f"[BG FETCH] done for {page_key}")
    except Exception as e:
        logger.error(f"[BG FETCH] failed for {page_key}: {e}")
    finally:
        _fetch_tasks.pop(page_key, None)


def _schedule_prefetch(lat: float, lon: float, depth: float, date_str: str):
    """Trigger a background prefetch for the next likely tile (simple lat/lon ±1 bucket)."""
    for dlat, dlon in [(LAT_BIN_DEG, 0), (0, LON_BIN_DEG)]:
        nlat, nlon = lat + dlat, lon + dlon
        nkey = f"point:{nlat:.3f}:{nlon:.3f}:{depth:.1f}:{date_str}"
        if l1_get(nkey) is not None:
            continue
        # If already present in local L2, warm L1 without origin network fetch
        phy_check = _read_phy_point(nlat, nlon, depth, date_str)
        if phy_check:
            bgc_check = _read_bgc_point(nlat, nlon, depth, date_str)
            l1_set(nkey, {"physics": phy_check, "bgc": bgc_check})
            continue
        if nkey not in _fetch_tasks and _fetcher.credentials_present():
            task = asyncio.create_task(
                _bg_fetch_point(nkey, nlat, nlon, depth, date_str)
            )
            _fetch_tasks[nkey] = task


# ==============================================================================
# ROOT
# ==============================================================================

@app.get("/")
def root():
    return {
        "service":  "oceanStream API",
        "version":  "3.0.0",
        "status":   "online",
        "endpoints": {
            "GET /ocean/point":     "Click-to-query: physics + BGC + nearest Argo float",
            "GET /ocean/snapshot":  "Bbox grid payload for map / rendering",
            "GET /ocean/timeline":  "Time-series at a point or region (charts)",
            "GET /ocean/coverage":  "Page-table state for debug / visualisation",
            "GET /argo/nearest":    "Argo floats near a clicked point",
            "GET /argo/profile":    "Depth profile with BGC fields",
            "GET /api/coastal-temps":   "(legacy) Coastal temperature series",
            "GET /api/depth-profile":   "(legacy) Depth profile",
            "GET /api/argo-floats":     "(legacy) Argo float list",
            "GET /api/aodn-data":       "(legacy) AODN CTD data",
            "GET /api/cache-stats":     "Cache telemetry",
            "POST /api/cache-clear":    "Flush L1 cache",
            "WS /ws/coastal-temps":     "(legacy) Progressive WebSocket",
        },
    }


# ==============================================================================
# /ocean/point  — THE core click-to-query endpoint
# ==============================================================================

@app.get("/ocean/point")
async def ocean_point(
    lat:   float = Query(..., ge=-90,  le=90,  description="Latitude"),
    lon:   float = Query(..., ge=-180, le=180, description="Longitude"),
    depth: float = Query(0.0, ge=0,   le=6000, description="Depth in metres"),
    date:  Optional[str] = Query(None, description="ISO date YYYY-MM-DD (default: today)"),
):
    """
    The primary click-to-query endpoint.

    Checks the page table and returns instantly if cached (RESIDENT or ON_DISK).
    On a miss, marks the page FETCHING, triggers a background fetch, and returns
    status=fetching immediately. Re-request after a few seconds to get data.
    Response always includes: physics + bgc + nearest_argo_float + routing info.
    """
    t0 = time.perf_counter()
    cache_stats["total_requests"] += 1
    date_str = resolve_date_input(date)

    page_key = f"point:{lat:.3f}:{lon:.3f}:{depth:.1f}:{date_str}"

    # ---- L1 hit ----
    cached = l1_get(page_key)
    if cached:
        cache_stats["l1_hits"] += 1
        argo_float = await _argo.get_nearest_float_summary(lat, lon, date_str=date_str)
        return {
            "status":     "ok",
            "cache":      "L1_RAM",
            "lat":        lat, "lon": lon, "depth": depth, "date": date_str,
            "elapsed_ms": round((time.perf_counter() - t0) * 1000, 2),
            "physics":           cached["physics"],
            "bgc":               cached["bgc"],
            "nearest_argo_float": argo_float,
            "dataset_info":      route_info(date_str),
        }

    # ---- L2 hit ----
    phy_data = _read_phy_point(lat, lon, depth, date_str)
    bgc_data = _read_bgc_point(lat, lon, depth, date_str)

    if phy_data or bgc_data:
        cache_stats["l2_hits"] += 1
        payload = {"physics": phy_data, "bgc": bgc_data}
        l1_set(page_key, payload)
        page_table.touch(page_key)
        argo_float = await _argo.get_nearest_float_summary(lat, lon, date_str=date_str)
        _schedule_prefetch(lat, lon, depth, date_str)
        return {
            "status":     "ok",
            "cache":      "L2_ZARR",
            "lat":        lat, "lon": lon, "depth": depth, "date": date_str,
            "elapsed_ms": round((time.perf_counter() - t0) * 1000, 2),
            "physics":           phy_data,
            "bgc":               bgc_data,
            "nearest_argo_float": argo_float,
            "dataset_info":      route_info(date_str),
        }

    # ---- FETCHING in progress ----
    if page_key in _fetch_tasks:
        task = _fetch_tasks[page_key]
        try:
            await asyncio.wait_for(asyncio.shield(task), timeout=2.0)
            cached2 = l1_get(page_key)
            if cached2:
                argo_float = await _argo.get_nearest_float_summary(lat, lon, date_str=date_str)
                return {
                    "status": "ok", "cache": "L1_RAM (just fetched)",
                    "lat": lat, "lon": lon, "depth": depth, "date": date_str,
                    "elapsed_ms": round((time.perf_counter() - t0) * 1000, 2),
                    "physics": cached2["physics"], "bgc": cached2["bgc"],
                    "nearest_argo_float": argo_float,
                    "dataset_info": route_info(date_str),
                }
        except asyncio.TimeoutError:
            pass
        return {
            "status":     "fetching",
            "message":    "Data is being fetched from the origin — retry in a few seconds.",
            "lat":        lat, "lon": lon, "depth": depth, "date": date_str,
            "elapsed_ms": round((time.perf_counter() - t0) * 1000, 2),
        }

    # ---- NOT_FETCHED — kick off background fetch ----
    _, missing = page_table.diff(
        lat - LAT_BIN_DEG, lat + LAT_BIN_DEG,
        lon - LON_BIN_DEG, lon + LON_BIN_DEG,
        max(0, depth - DEPTH_BIN_M), depth + DEPTH_BIN_M,
        date_str,
    )
    if missing:
        page_table.mark_fetching(missing)

    task = asyncio.create_task(_bg_fetch_point(page_key, lat, lon, depth, date_str))
    _fetch_tasks[page_key] = task

    # Wait up to 2 s — fast if zarr already has partial data
    try:
        await asyncio.wait_for(asyncio.shield(task), timeout=2.0)
        cached3 = l1_get(page_key)
        if cached3:
            argo_float = await _argo.get_nearest_float_summary(lat, lon, date_str=date_str)
            return {
                "status": "ok", "cache": "FRESHLY_FETCHED",
                "lat": lat, "lon": lon, "depth": depth, "date": date_str,
                "elapsed_ms": round((time.perf_counter() - t0) * 1000, 2),
                "physics": cached3["physics"], "bgc": cached3["bgc"],
                "nearest_argo_float": argo_float,
                "dataset_info": route_info(date_str),
            }
    except asyncio.TimeoutError:
        pass

    return {
        "status":     "fetching",
        "message":    "Fetch started — data will be ready in ~30-90 s. Re-request this endpoint.",
        "lat":        lat, "lon": lon, "depth": depth, "date": date_str,
        "elapsed_ms": round((time.perf_counter() - t0) * 1000, 2),
        "dataset_info": route_info(date_str),
    }


# ==============================================================================
# /ocean/snapshot  — spatial grid for map / 3D rendering
# ==============================================================================

@app.get("/ocean/snapshot")
async def ocean_snapshot(
    lat_min: float = Query(...),
    lat_max: float = Query(...),
    lon_min: float = Query(...),
    lon_max: float = Query(...),
    depth:   float = Query(0.0, ge=0, le=6000),
    date:    Optional[str] = Query(None),
):
    """
    Return a grid of physics + BGC values covering the bounding box at the
    given depth and date. Suitable for map overlays and 3D surface rendering.
    """
    t0 = time.perf_counter()
    date_str = resolve_date_input(date)
    snap_key = f"snap:{lat_min:.2f}:{lat_max:.2f}:{lon_min:.2f}:{lon_max:.2f}:{depth:.0f}:{date_str}"

    cached = l1_get(snap_key)
    if cached:
        return {**cached, "cache": "L1_RAM",
                "elapsed_ms": round((time.perf_counter() - t0) * 1000, 2)}

    grid = _read_phy_grid(lat_min, lat_max, lon_min, lon_max, depth, date_str)

    # Try to attach BGC values at each grid point (coarser resolution — nearest-neighbour)
    if bgc_dataset_xr is not None and grid:
        try:
            region = bgc_dataset_xr.sel(
                {_lat_coord(bgc_dataset_xr): slice(lat_min, lat_max),
                 _lon_coord(bgc_dataset_xr): slice(lon_min, lon_max)}
            )
            if "depth" in region.dims:
                region = region.sel(depth=depth, method="nearest")
            if "time" in region.dims:
                region = region.sel(time=np.datetime64(date_str), method="nearest")

            lc, lnc = _lat_coord(bgc_dataset_xr), _lon_coord(bgc_dataset_xr)
            bgc_lats = region[lc].values
            bgc_lons = region[lnc].values

            if len(bgc_lats) > 0 and len(bgc_lons) > 0:
                bgc_var_data = {}
                for src, dst in [("chl","chlorophyll_mgl"),("no3","nitrate_mmolm3"),
                                  ("o2","oxygen_mmolm3"),("ph","ph")]:
                    if src in region:
                        arr = region[src].values
                        while arr.ndim > 2:
                            arr = arr[0]
                        bgc_var_data[dst] = arr

                for row in grid:
                    nearest_i = int(np.argmin(np.abs(bgc_lats - row["lat"])))
                    nearest_j = int(np.argmin(np.abs(bgc_lons - row["lon"])))
                    for dst, arr in bgc_var_data.items():
                        if nearest_i < arr.shape[0] and nearest_j < arr.shape[1]:
                            row[dst] = _safe_float(arr[nearest_i, nearest_j])
        except Exception as e:
            logger.debug(f"[snapshot BGC] {e}")

    phy_coverage = sum(1 for r in grid if r.get("temperature_c") is not None)
    bgc_coverage = sum(1 for r in grid if r.get("chlorophyll_mgl") is not None)
    n = max(1, len(grid))

    result = {
        "status": "ok" if grid else "no_data",
        "bbox": {"lat_min": lat_min, "lat_max": lat_max,
                 "lon_min": lon_min, "lon_max": lon_max},
        "depth": depth, "date": date_str,
        "grid": grid,
        "coverage": {
            "total_points":        n,
            "physics_coverage_pct": round(phy_coverage / n * 100, 1),
            "bgc_coverage_pct":     round(bgc_coverage / n * 100, 1),
        },
        "dataset_info": route_info(date_str),
    }
    if grid:
        l1_set(snap_key, result)
    return {**result, "cache": "L2_ZARR",
            "elapsed_ms": round((time.perf_counter() - t0) * 1000, 2)}


# ==============================================================================
# /ocean/timeline  — time series at a point, powers all charts
# ==============================================================================

@app.get("/ocean/timeline")
async def ocean_timeline(
    lat:         float = Query(..., ge=-90, le=90),
    lon:         float = Query(..., ge=-180, le=180),
    depth:       float = Query(0.0, ge=0, le=6000),
    preset:      Optional[str] = Query(
        None,
        description=(
            "Date range shortcut: 'yesterday', 'week'/'7d', 'month'/'30d', "
            "'year'/'1y'. Overrides date_start/date_end when provided."
        ),
    ),
    date_start:  Optional[str] = Query(None, description="ISO date YYYY-MM-DD (ignored when preset is set)"),
    date_end:    Optional[str] = Query(None, description="ISO date YYYY-MM-DD (ignored when preset is set)"),
    granularity: str   = Query("day", enum=["day", "week", "month", "year"]),
    variables:   str   = Query(
        "temperature,salinity,chlorophyll,oxygen",
        description="Comma-separated variable names (temperature, salinity, chlorophyll, "
                    "nitrate, phosphate, silicate, oxygen, ph, pco2, current_u, current_v, sea_level)"
    ),
):
    """
    Return a time-series array at (lat, lon, depth) over [date_start, date_end].

    **Date selection** — pick ONE approach:
    * `preset=yesterday|week|month|year`  — smart preset, always uses latest available data
    * `date_start` + `date_end`           — explicit ISO dates
    * Neither                             — defaults to last 7 days

    Granularity controls aggregation: day/week/month/year.
    Variables list controls which fields appear in each row.
    """
    t0 = time.perf_counter()

    # Resolve date range — preset takes priority; falls back to explicit dates
    resolved_start, resolved_end = resolve_date_range(
        preset=preset,
        date_start=date_start,
        date_end=date_end,
    )

    var_list = [v.strip() for v in variables.split(",") if v.strip()]
    tl_key = (
        f"tl:{lat:.3f}:{lon:.3f}:{depth:.1f}:"
        f"{resolved_start}:{resolved_end}:{granularity}:{','.join(sorted(var_list))}"
    )

    cached = l1_get(tl_key)
    if cached:
        return {**cached, "cache": "L1_RAM",
                "elapsed_ms": round((time.perf_counter() - t0) * 1000, 2)}

    series = _read_timeline(lat, lon, depth, resolved_start, resolved_end, granularity, var_list)

    ds_phy = phy_dataset(resolved_start)
    ds_bgc = bgc_dataset(resolved_start)

    result = {
        "status":      "ok" if series else "no_data",
        "point":       {"lat": lat, "lon": lon, "depth": depth},
        "preset":      preset,
        "date_start":  resolved_start,
        "date_end":    resolved_end,
        "granularity": granularity,
        "variables":   var_list,
        "n_points":    len(series),
        "series":      series,
        "dataset_info": {
            "phy_dataset": ds_phy,
            "bgc_dataset": ds_bgc,
            "note": "Routing may mix ANALYSISFORECAST and MULTIYEAR datasets across the date range."
        },
    }
    if series:
        l1_set(tl_key, result)
    return {**result, "cache": "L2_ZARR",
            "elapsed_ms": round((time.perf_counter() - t0) * 1000, 2)}


# ==============================================================================
# /argo/nearest
# ==============================================================================

@app.get("/argo/nearest")
async def argo_nearest(
    lat:       float = Query(..., ge=-90, le=90),
    lon:       float = Query(..., ge=-180, le=180),
    radius_km: float = Query(200.0, ge=1, le=2000),
    type:      str   = Query("both", enum=["core", "bgc", "both"]),
    date:      Optional[str] = Query(None),
):
    """
    Find Argo floats within radius_km of (lat, lon).
    type=core → Core Argo (temp + salinity)
    type=bgc  → BGC-Argo (oxygen, nitrate, chlorophyll, pH)
    type=both → all floats, merged and sorted by distance
    """
    t0 = time.perf_counter()
    date_str = date or today_iso()

    floats = await _argo.find_nearest_floats(lat, lon, radius_km, type, date_str)

    # Also check AODN CTD mooring
    aodn = _argo.nearest_aodn_ctd(lat, lon, radius_km)
    if aodn:
        floats.append(aodn)
        floats.sort(key=lambda x: x.get("distance_km", 9999))

    return {
        "status":    "ok",
        "query":     {"lat": lat, "lon": lon, "radius_km": radius_km, "type": type},
        "n_floats":  len(floats),
        "floats":    floats,
        "elapsed_ms": round((time.perf_counter() - t0) * 1000, 2),
    }


# ==============================================================================
# /argo/profile
# ==============================================================================

@app.get("/argo/profile")
async def argo_profile(
    platform_number: Optional[str] = Query(None, description="Argo platform number"),
    lat: Optional[float] = Query(None, ge=-90, le=90, description="Latitude to find nearest float if platform_number omitted"),
    lon: Optional[float] = Query(None, ge=-180, le=180, description="Longitude to find nearest float if platform_number omitted"),
    date: Optional[str] = Query(None, description="ISO date for time window"),
    time_str: Optional[str] = Query(None, alias="time", description="Alias for date parameter"),
):
    """
    Fetch a depth-ordered profile for an Argo float or nearest to (lat, lon).
    Returns all available fields: depth, temperature, salinity,
    oxygen, chlorophyll, nitrate, pH, timestamp.
    """
    t0 = time.perf_counter()
    target_date = date or time_str
    prof_id = platform_number or (f"{lat:.2f}:{lon:.2f}" if (lat is not None and lon is not None) else "default")
    profile_key = f"profile:{prof_id}:{target_date or 'latest'}"

    cached = l1_get(profile_key)
    if cached:
        return {**cached, "cache": "L1_RAM",
                "elapsed_ms": round((time.perf_counter() - t0) * 1000, 2)}

    result = await _argo.fetch_argo_profile(
        platform_number=platform_number, date_str=target_date, lat=lat, lon=lon
    )
    if result.get("status") == "success":
        l1_set(profile_key, result)
    return {**result, "elapsed_ms": round((time.perf_counter() - t0) * 1000, 2)}


# ==============================================================================
# /ocean/coverage  — page table state
# ==============================================================================

@app.get("/ocean/coverage")
def ocean_coverage(
    lat_min: Optional[float] = Query(None),
    lat_max: Optional[float] = Query(None),
    lon_min: Optional[float] = Query(None),
    lon_max: Optional[float] = Query(None),
):
    """Return page-table state for a region (or all pages if no bbox given)."""
    pages = page_table.serialise(lat_min, lat_max, lon_min, lon_max)
    stats = page_table.stats()
    return {
        "status": "ok",
        "query_region": {
            "lat_min": lat_min, "lat_max": lat_max,
            "lon_min": lon_min, "lon_max": lon_max,
        },
        "page_table_stats": stats,
        "active_fetches": len(_fetch_tasks),
        "l1_entries": len(_l1),
        "pages": pages,
    }


# ==============================================================================
# LEGACY /api/* ENDPOINTS (preserved for backward compat)
# ==============================================================================

@app.get("/api/date-info")
def api_date_info():
    """Returns current date context, Copernicus availability, and calendar bounds."""
    return date_info()

@app.get("/api/metadata")
def api_metadata():
    ds = ocean_dataset_xr or phy_dataset_xr
    if ds is None:
        raise HTTPException(503, "No zarr store loaded yet.")
    lc, lnc = _lat_coord(ds), _lon_coord(ds)
    lats  = ds[lc].values
    lons  = ds[lnc].values
    depths = ds["depth"].values.tolist() if "depth" in ds.coords else []
    times  = [str(t)[:10] for t in ds["time"].values] if "time" in ds.coords else []
    return {
        "status": "ok",
        "dimensions": dict(ds.sizes),
        "variables": list(ds.data_vars),
        "lat_range": [float(lats.min()), float(lats.max())],
        "lon_range": [float(lons.min()), float(lons.max())],
        "depths": depths,
        "time_range": [times[0], times[-1]] if times else [],
        "locations": LOCATIONS,
    }


@app.get("/api/coastal-temps")
def api_coastal_temps(variable: str = "thetao"):
    t0 = time.perf_counter()
    ds = ocean_dataset_xr or phy_dataset_xr
    if ds is None:
        raise HTTPException(503, "Ocean zarr not loaded.")

    results, details = {}, {}
    for loc_key, loc in LOCATIONS.items():
        key = f"series:{loc_key}:{variable}"
        cached = l1_get(key)
        if cached:
            series = cached
            layer = "L1_RAM"
        else:
            try:
                pt = _select_point(ds, loc["lat"], loc["lon"])
                if "depth" in pt.dims:
                    pt = pt.isel(depth=0)
                times = pt["time"].values
                vals  = pt[variable].values
                series = [{"date": str(t)[:10], "value": _safe_float(v)}
                          for t, v in zip(times, vals)]
                l1_set(key, series)
                layer = "L2_ZARR"
            except Exception as e:
                series = []
                layer = f"ERROR:{e}"
        results[loc_key] = series
        details[loc_key] = {"location": loc["name"], "lat": loc["lat"],
                             "lon": loc["lon"], "cache_layer": layer}

    return {
        "status": "success", "variable": variable, "unit": "°C",
        "total_elapsed_ms": round((time.perf_counter() - t0) * 1000, 3),
        "stations": details, "data": results,
    }


@app.get("/api/depth-profile")
def api_depth_profile(location: str = "chennai", variable: str = "thetao"):
    ds = ocean_dataset_xr or phy_dataset_xr
    if ds is None:
        raise HTTPException(503, "Ocean zarr not loaded.")
    if location not in LOCATIONS:
        raise HTTPException(404, f"Location {location!r} not found.")
    loc = LOCATIONS[location]
    key = f"depth:{location}:{variable}"
    cached = l1_get(key)
    if cached:
        return {"location": loc["name"], "cache": "L1_RAM", "profile": cached}
    try:
        pt = _select_point(ds, loc["lat"], loc["lon"])
        depths = pt["depth"].values
        vals   = pt[variable].isel(time=-1).values
        profile = [{"depth_m": round(float(d), 2), "value": _safe_float(v)}
                   for d, v in zip(depths, vals)]
        l1_set(key, profile)
        return {"location": loc["name"], "cache": "L2_ZARR", "profile": profile}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/api/argo-floats")
def api_argo_floats(limit: int = Query(200, ge=1, le=5000)):
    ds = argo_dataset_xr
    if ds is None:
        raise HTTPException(503, "Argo zarr not loaded.")
    n = int(ds.sizes.get("N_POINTS", 0))
    cap = min(n, limit)
    floats = []
    lats  = ds["LATITUDE"].values
    lons  = ds["LONGITUDE"].values
    times = ds["TIME"].values
    pres  = ds["PRES"].values          if "PRES"            in ds else []
    temps = ds["TEMP"].values          if "TEMP"            in ds else []
    plats = ds["PLATFORM_NUMBER"].values if "PLATFORM_NUMBER" in ds else []
    for i in range(cap):
        floats.append({
            "platform_number": str(plats[i]).strip() if i < len(plats) else None,
            "lat":   round(float(lats[i]), 4),
            "lon":   round(float(lons[i]), 4),
            "depth_dbar": _safe_float(pres[i])  if i < len(pres)  else None,
            "temp_c":     _safe_float(temps[i]) if i < len(temps) else None,
            "datetime":   str(times[i])[:19]    if i < len(times) else None,
        })
    return {"status": "success", "total_in_store": n, "returned": cap, "floats": floats}


@app.get("/api/argo-profiles")
def api_argo_profiles(max_platforms: int = Query(20, ge=1, le=100)):
    ds = argo_dataset_xr
    if ds is None:
        raise HTTPException(503, "Argo zarr not loaded.")
    if "PLATFORM_NUMBER" not in ds:
        raise HTTPException(422, "PLATFORM_NUMBER not in Argo zarr.")
    plats = ds["PLATFORM_NUMBER"].values
    unique_plats = list(dict.fromkeys(str(p).strip() for p in plats))[:max_platforms]
    pres  = ds["PRES"].values   if "PRES"  in ds else []
    temps = ds["TEMP"].values   if "TEMP"  in ds else []
    psals = ds["PSAL"].values   if "PSAL"  in ds else []
    times = ds["TIME"].values   if "TIME"  in ds else []
    lats  = ds["LATITUDE"].values
    lons  = ds["LONGITUDE"].values

    profiles = {}
    for i, p in enumerate(plats):
        pn = str(p).strip()
        if pn not in unique_plats:
            continue
        if pn not in profiles:
            profiles[pn] = {"platform_number": pn, "measurements": []}
        profiles[pn]["measurements"].append({
            "depth_dbar":  _safe_float(pres[i])  if i < len(pres)  else None,
            "temp_c":      _safe_float(temps[i]) if i < len(temps) else None,
            "salinity_psu": _safe_float(psals[i]) if i < len(psals) else None,
            "lat":         round(float(lats[i]), 4),
            "lon":         round(float(lons[i]), 4),
            "datetime":    str(times[i])[:19]    if i < len(times) else None,
        })
    return {"status": "success", "platforms": list(profiles.values())}


@app.get("/api/argo-slider")
def api_argo_slider(
    date_start: str = Query(None, description="ISO date YYYY-MM-DD (default: 30 days ago)"),
    date_end:   str = Query(None, description="ISO date YYYY-MM-DD (default: latest available)"),
):
    ds = argo_dataset_xr
    if ds is None:
        raise HTTPException(503, "Argo zarr not loaded.")

    # Dynamic defaults — no hardcoded years
    resolved_start = resolve_date_input(date_start) if date_start else (
        (__import__('datetime').date.today() - __import__('datetime').timedelta(days=30)).isoformat()
    )
    resolved_end = resolve_date_input(date_end) if date_end else latest_available_iso()

    times = ds["TIME"].values
    lats  = ds["LATITUDE"].values
    lons  = ds["LONGITUDE"].values
    plats = ds["PLATFORM_NUMBER"].values if "PLATFORM_NUMBER" in ds else []
    t0 = np.datetime64(resolved_start)
    t1 = np.datetime64(resolved_end)
    mask  = (times >= t0) & (times <= t1)
    idx   = np.where(mask)[0]
    floats = []
    for i in idx[:1000]:
        floats.append({
            "platform_number": str(plats[i]).strip() if i < len(plats) else None,
            "lat": round(float(lats[i]), 4),
            "lon": round(float(lons[i]), 4),
            "datetime": str(times[i])[:19],
        })
    return {"status": "success", "date_start": resolved_start, "date_end": resolved_end,
            "count": len(floats), "floats": floats}


@app.get("/api/aodn-data")
def api_aodn_data():
    data = _argo.load_aodn_ctd()
    return data


@app.get("/api/ocean-overview")
def api_ocean_overview():
    ds = ocean_dataset_xr or phy_dataset_xr
    if ds is None:
        raise HTTPException(503, "Ocean zarr not loaded.")
    key = "overview"
    cached = l1_get(key)
    if cached:
        return {**cached, "cache": "L1_RAM"}
    try:
        lc, lnc = _lat_coord(ds), _lon_coord(ds)
        region = ds.sel({
            lc: slice(BBOX["min_lat"], BBOX["max_lat"]),
            lnc: slice(BBOX["min_lon"], BBOX["max_lon"]),
        })
        v = "thetao" if "thetao" in region else list(region.data_vars)[0]
        arr = region[v].isel(time=-1)
        if "depth" in arr.dims:
            arr = arr.isel(depth=0)
        vals = arr.values
        flat = vals.ravel()[~np.isnan(vals.ravel())]
        overview = {
            "status": "ok",
            "variable": v,
            "bbox": BBOX,
            "min": round(float(flat.min()), 3) if len(flat) else None,
            "max": round(float(flat.max()), 3) if len(flat) else None,
            "mean": round(float(flat.mean()), 3) if len(flat) else None,
            "grid_shape": list(arr.shape),
        }
        l1_set(key, overview)
        return {**overview, "cache": "L2_ZARR"}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/api/cache-stats")
def api_cache_stats():
    total = max(1, cache_stats["total_requests"])
    return {
        **cache_stats,
        "l1_hit_rate_pct": round(cache_stats["l1_hits"] / total * 100, 1),
        "l2_hit_rate_pct": round(cache_stats["l2_hits"] / total * 100, 1),
        "l1_entries": len(_l1),
        "active_background_fetches": len(_fetch_tasks),
        "page_table": page_table.stats(),
    }


@app.post("/api/cache-clear")
def api_cache_clear():
    n = l1_clear()
    cache_stats.update({"l1_hits": 0, "l2_hits": 0, "fetches": 0, "total_requests": 0})
    return {"status": "ok", "cleared_entries": n}


@app.get("/api/date-presets")
def api_date_presets():
    """
    Return server-computed date presets for all common UI needs.
    Frontend should call this once on load to avoid hardcoded years.
    """
    from router import latest_available_iso, last_week_iso, last_month_iso, last_year_iso
    today        = _date.today()
    latest       = latest_available_iso()
    yesterday    = (today - timedelta(days=1)).isoformat()
    week_start   = last_week_iso()
    month_start  = last_month_iso()
    year_start   = last_year_iso()
    return {
        "status":      "ok",
        "server_date": today.isoformat(),
        "latest_available": latest,
        "presets": {
            "yesterday": {"label": "Yesterday",  "start": yesterday,   "end": latest},
            "week":      {"label": "Last 7 Days", "start": week_start,  "end": latest},
            "month":     {"label": "Last Month",  "start": month_start, "end": latest},
            "year":      {"label": "Last Year",   "start": year_start,  "end": latest},
        },
        "note": (
            "latest_available is yesterday or earlier — Copernicus data is "
            "published with a ~24-36 h lag so today's date may return no data."
        ),
    }


@app.get("/api/files")
def api_files(show_hidden: bool = False):
    files = []
    for d in [OUTPUT_DIR, ROOT_DIR / "aodn_output"]:
        if not d.exists():
            continue
        for f in sorted(d.rglob("*")):
            if f.is_file():
                rel = str(f.relative_to(ROOT_DIR))
                if not show_hidden and (rel.startswith(".") or "/.zarray" in rel or "/.zattrs" in rel):
                    continue
                files.append({"path": rel, "size_bytes": f.stat().st_size,
                               "size_mb": round(f.stat().st_size / 1024 / 1024, 2)})
    return {"status": "ok", "count": len(files), "files": files}


# ==============================================================================
# WEBSOCKET — legacy progressive streaming
# ==============================================================================

@app.websocket("/ws/coastal-temps")
async def ws_coastal_temps(ws: WebSocket):
    await ws.accept()
    try:
        msg = await asyncio.wait_for(ws.receive_json(), timeout=30)
        location = str(msg.get("location", "chennai")).lower().strip()
        variable  = str(msg.get("variable", "thetao"))

        ds = ocean_dataset_xr or phy_dataset_xr
        if ds is None:
            await ws.send_json({"stage": "error", "message": "Ocean zarr not loaded."})
            return

        loc = LOCATIONS.get(location)
        if not loc:
            await ws.send_json({"stage": "error", "message": f"Unknown location: {location}"})
            return

        pt = _select_point(ds, loc["lat"], loc["lon"])
        if "depth" in pt.dims:
            pt = pt.isel(depth=0)
        times = pt["time"].values
        vals  = pt[variable].values
        full  = [{"date": str(t)[:10], "value": _safe_float(v)} for t, v in zip(times, vals)]

        # Stage 1: last 5 points (instant preview)
        await ws.send_json({
            "stage": "preview", "location": loc["name"],
            "data": full[-5:], "total_available": len(full),
        })
        await asyncio.sleep(0)

        # Stage 2: full data
        await ws.send_json({
            "stage": "full", "location": loc["name"],
            "data": full, "total_available": len(full),
        })
    except WebSocketDisconnect:
        pass
    except asyncio.TimeoutError:
        await ws.send_json({"stage": "error", "message": "Timeout waiting for request."})
    except Exception as e:
        try:
            await ws.send_json({"stage": "error", "message": str(e)})
        except Exception:
            pass


@app.websocket("/ws/ocean-stream")
async def ws_ocean_stream(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            msg = await ws.receive_json()
            t0 = time.perf_counter()

            # Viewport bounding-box streaming
            if "lat_min" in msg or "depth_min" in msg or "depth_max" in msg:
                lat_min = float(msg.get("lat_min", 8.0))
                lat_max = float(msg.get("lat_max", 20.0))
                lon_min = float(msg.get("lon_min", 68.0))
                lon_max = float(msg.get("lon_max", 90.0))
                depth_min = float(msg.get("depth_min", 0.0))
                depth_max = float(msg.get("depth_max", 10.0))
                date_str = str(msg.get("time") or msg.get("date") or today_iso())

                served, missing = page_table.diff(
                    lat_min, lat_max, lon_min, lon_max, depth_min, depth_max, date_str
                )

                await ws.send_json({
                    "type": "stream_start",
                    "resident_count": len(served),
                    "missing_count": len(missing),
                    "date": date_str,
                })

                depth_bins = depth_buckets_in_range(depth_min, depth_max)
                for db in depth_bins:
                    d_mid = db * DEPTH_BIN_M
                    grid_slice = _read_phy_grid(lat_min, lat_max, lon_min, lon_max, d_mid, date_str)

                    pts = [
                        {"lat": r["lat"], "lon": r["lon"], "value": r.get("temperature_c")}
                        for r in grid_slice
                    ]

                    await ws.send_json({
                        "stage": "resident",
                        "depth_m": d_mid,
                        "depth_range": f"{db * DEPTH_BIN_M:.0f}–{(db + 1) * DEPTH_BIN_M:.0f}",
                        "grid": pts,
                        "elapsed_ms": round((time.perf_counter() - t0) * 1000, 2),
                    })
                    await asyncio.sleep(0.01)

                if missing:
                    await ws.send_json({
                        "stage": "fetching",
                        "depth_m": depth_min,
                        "depth_range": f"{depth_min:.0f}–{depth_max:.0f}",
                        "message": f"Fetching {len(missing)} missing pages from origin",
                    })

                await ws.send_json({
                    "type": "stream_complete",
                    "total_elapsed_ms": round((time.perf_counter() - t0) * 1000, 2),
                })
            else:
                # Single point query format
                lat = float(msg.get("lat", 13.0))
                lon = float(msg.get("lon", 80.0))
                depth = float(msg.get("depth", 0.0))
                date_str = str(msg.get("date", today_iso()))

                await ws.send_json({"stage": "ack", "lat": lat, "lon": lon, "date": date_str, "routing": route_info(date_str)})

                phy_data = _read_phy_point(lat, lon, depth, date_str)
                bgc_data = _read_bgc_point(lat, lon, depth, date_str)
                await ws.send_json({
                    "stage": "data",
                    "lat": lat,
                    "lon": lon,
                    "depth": depth,
                    "date": date_str,
                    "physics": phy_data,
                    "bgc": bgc_data,
                    "elapsed_ms": round((time.perf_counter() - t0) * 1000, 2),
                })
    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await ws.send_json({"stage": "error", "message": str(e)})
        except Exception:
            pass


# ==============================================================================
# Entry point (root-level uvicorn shortcut)
# ==============================================================================
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
