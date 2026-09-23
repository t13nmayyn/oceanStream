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
import sys
import time
from datetime import date as _date, datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

_BACKEND_DIR = Path(__file__).resolve().parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

import numpy as np
import xarray as xr
from fastapi import FastAPI, HTTPException, Query, Request, WebSocket, WebSocketDisconnect, UploadFile, File, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

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
import glider as _glider
import observation as _obs
from router import (
    phy_dataset, bgc_dataset, route_info, today_iso, yesterday_iso,
    resolve_date_input, resolve_date_range, latest_available_iso,
    PHY_VARIABLES, BGC_VARIABLES, resolve_variables, date_info,
)
import ai_inference as _ai

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

FRONTEND_DIR = ROOT_DIR / "frontend-test"
if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

    @app.get("/ui", include_in_schema=False)
    @app.get("/test", include_in_schema=False)
    @app.get("/index.html", include_in_schema=False)
    def serve_frontend_ui():
        return FileResponse(FRONTEND_DIR / "index.html")

# ==============================================================================
# AI inference routes (Ocean067 temperature model)
# ==============================================================================
_ai.register_ai_routes(app)

# ==============================================================================
# L1 in-memory cache  (key → {data, ts})
# Hard cap at L1_MAX_ENTRIES to prevent unbounded growth from pre-warm accumulation.
# When cap is hit, the oldest 10% of entries are evicted before inserting.
# ==============================================================================
L1_TTL_SECONDS  = 300   # 5-minute TTL
L1_MAX_ENTRIES  = 500   # max number of L1 cache entries before LRU eviction
_l1: Dict[str, Dict] = {}

def l1_get(key: str) -> Optional[Any]:
    entry = _l1.get(key)
    if entry and (time.time() - entry["ts"]) < L1_TTL_SECONDS:
        return entry["data"]
    return None

def l1_set(key: str, data: Any) -> None:
    if len(_l1) >= L1_MAX_ENTRIES:
        # Evict the oldest 10% of entries by access timestamp
        evict_count = max(1, L1_MAX_ENTRIES // 10)
        oldest = sorted(_l1.items(), key=lambda x: x[1]["ts"])[:evict_count]
        for k, _ in oldest:
            _l1.pop(k, None)
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
# Pre-warm regions: fixed, pinned tiles always kept in L1 / page table.
# These cover the Indian Ocean home region so first render is instant.
# Each tuple: (label, lat_min, lat_max, lon_min, lon_max)
# ==============================================================================
PREWARM_REGIONS = [
    # Indian Ocean (open water)
    ("indian_ocean_central",   10.0, 14.0, 72.0, 80.0),
    # Arabian Sea
    ("arabian_sea_n",          18.0, 22.0, 60.0, 68.0),
    ("arabian_sea_s",          10.0, 14.0, 60.0, 68.0),
    # Bay of Bengal
    ("bay_of_bengal_n",        18.0, 22.0, 84.0, 92.0),
    ("bay_of_bengal_central",  14.0, 18.0, 80.0, 88.0),
    # Coastal India
    ("coastal_india_se",       10.0, 14.0, 78.0, 84.0),
    ("lakshadweep",             8.0, 12.0, 72.0, 76.0),
    # Andaman Sea
    ("andaman_sea",            10.0, 14.0, 92.0, 98.0),
]


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


# Thread-safe zarr reload lock — prevents concurrent reloads from racing
import threading
_zarr_reload_lock = threading.Lock()


def _safe_open_zarr(path: Path) -> Optional[xr.Dataset]:
    """Open a zarr store safely, trying consolidated metadata first."""
    try:
        return xr.open_zarr(str(path), consolidated=True)
    except Exception:
        try:
            return xr.open_zarr(str(path))
        except Exception as e:
            logger.warning(f"[Zarr open] {path.name} failed: {e}")
            return None


def _reload_phy_zarr():
    """Reload PHY zarr store into global variable (thread-safe)."""
    global phy_dataset_xr
    with _zarr_reload_lock:
        if PHY_ZARR_PATH.exists():
            ds = _safe_open_zarr(PHY_ZARR_PATH)
            if ds is not None:
                phy_dataset_xr = ds
                return True
    return False


def _reload_bgc_zarr():
    """Reload BGC zarr store into global variable (thread-safe)."""
    global bgc_dataset_xr
    with _zarr_reload_lock:
        if BGC_ZARR_PATH.exists():
            ds = _safe_open_zarr(BGC_ZARR_PATH)
            if ds is not None:
                bgc_dataset_xr = ds
                return True
    return False


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
                ds = _safe_open_zarr(path)
                if ds is not None:
                    globals()[attr_name] = ds
                    logger.info(f"[L2 OK] {label} zarr: {dict(ds.sizes)}")
                    if attr_name in ("phy_dataset_xr", "ocean_dataset_xr"):
                        _populate_page_table(ds, path)
            except Exception as e:
                logger.warning(f"[L2 WARN] {label} zarr open failed: {e}")
        else:
            logger.info(f"[L2] {label} zarr not found at {path} (will fetch on demand)")

    logger.info("=" * 60)
    logger.info("[PRE-WARM] Scheduling home-region pre-warm...")
    # Schedule the async pre-warm; it runs once startup is complete
    asyncio.ensure_future(_prewarm_home_regions())


# ==============================================================================
# Zarr slice helpers
# ==============================================================================

def _select_point(ds: xr.Dataset, lat: float, lon: float) -> xr.Dataset:
    return ds.sel({_lat_coord(ds): lat, _lon_coord(ds): lon}, method="nearest")


def _synthesize_phy_point(lat: float, lon: float, depth: float) -> Dict[str, Optional[float]]:
    """Generate physically plausible physics values from a simple analytical model.
    Used as synthetic pre-warm placeholder before real Copernicus data is fetched."""
    depth_factor = math.exp(-depth / 130.0)
    lat_norm = max(0.0, min(1.0, (lat - 8.0) / 14.0))
    temp_c = round(29.5 - 1.8 * lat_norm - 5.0 * (1.0 - depth_factor), 2)
    sal    = round(34.2 - 1.2 * lat_norm + 0.4 * (1.0 - math.exp(-depth / 30.0)), 2)
    u      = round(0.14 * math.sin(lat * 0.2 + lon * 0.1), 3)
    v      = round(0.09 * math.cos(lat * 0.15 - lon * 0.1), 3)
    zos    = round(0.04 + 0.03 * math.sin(lon * 0.3), 3)
    return {
        "temperature_c": temp_c,
        "salinity_psu":  sal,
        "current_u_ms":  u,
        "current_v_ms":  v,
        "sea_level_m":   zos,
    }


def _synthesize_bgc_point(temp_c: Optional[float], depth: float) -> Dict[str, Optional[float]]:
    t = 28.0 if temp_c is None else temp_c
    depth_factor = math.exp(-depth / 130.0)
    # Oceanographic models for tropical Indian Ocean / Bay of Bengal:
    # 1. Dissolved Oxygen: ~190-215 mmol/m3 at surface, drop to OMZ ~65-90 mmol/m3 at depth
    o2 = round(65.0 + 145.0 * depth_factor, 2)
    # 2. Chlorophyll-a: peaked near deep chlorophyll maximum (~25-45m)
    chl = round(max(0.08, 0.22 + 0.72 * math.exp(-((depth - 32.0) ** 2) / 300.0)), 3)
    # 3. Nitrate: low at surface (< 1.5), increases with depth
    no3 = round(1.2 + 28.0 * (1.0 - math.exp(-depth / 60.0)), 2)
    # 4. Phosphate: Redfield ratio ~ NO3 / 16
    po4 = round(max(0.1, no3 / 16.0), 3)
    # 5. Silicate: surface depleted, deep enriched
    si = round(2.8 + 22.0 * (1.0 - math.exp(-depth / 80.0)), 2)
    # 6. pH: ~8.12 surface, ~7.80 deep
    ph_val = round(8.12 - 0.30 * (1.0 - math.exp(-depth / 90.0)), 3)
    # 7. pCO2: ~395 surface, higher deep
    pco2 = round(395.0 + 85.0 * (1.0 - math.exp(-depth / 110.0)), 1)
    return {
        "chlorophyll_mgl": chl,
        "nitrate_mmolm3": no3,
        "phosphate_mmolm3": po4,
        "silicate_mmolm3": si,
        "oxygen_mmolm3": o2,
        "ph": ph_val,
        "pco2_uatm": pco2,
    }


def _read_phy_point(lat: float, lon: float, depth: float, date_str: str) -> Dict:
    """Read physics variables from L2 zarr at nearest grid point with date verification."""
    global phy_dataset_xr
    if phy_dataset_xr is None and PHY_ZARR_PATH.exists():
        try:
            phy_dataset_xr = xr.open_zarr(PHY_ZARR_PATH)
        except Exception:
            pass

    ds = phy_dataset_xr or ocean_dataset_xr
    if ds is None:
        return {}
    try:
        # Check if dataset contains this date
        if "time" in ds.coords:
            times = ds["time"].values
            if len(times) == 0:
                return {}
            t_min = str(times.min())[:10]
            t_max = str(times.max())[:10]
            if date_str < t_min or date_str > t_max:
                return {}

        pt = _select_point(ds, lat, lon)
        actual_depth = depth
        if "depth" in pt.dims:
            pt = pt.sel(depth=depth, method="nearest")
            actual_depth = _safe_float(pt["depth"].values) or depth

        if "time" in pt.dims:
            pt = pt.sel(time=np.datetime64(date_str), method="nearest")
            actual_time = str(pt["time"].values)[:10]
            if actual_time != date_str:
                return {}

        result: Dict[str, Any] = {
            "requested_depth_m": depth,
            "actual_depth_m": actual_depth,
            "depth_selection_method": "nearest_source_level",
            "date": date_str,
        }
        var_map = {
            "thetao": "temperature_c",
            "so":     "salinity_psu",
            "uo":     "current_u_ms",
            "vo":     "current_v_ms",
            "zos":    "sea_level_m",
        }
        for src, dst in var_map.items():
            if src in pt:
                val = _safe_float(pt[src].values)
                if val == 0.0 and dst in ("temperature_c", "salinity_psu"):
                    val = None
                result[dst] = val

        if result.get("temperature_c") is None and result.get("salinity_psu") is None:
            return {}

        # Compute speed and heading for current vectors
        u = result.get("current_u_ms")
        v = result.get("current_v_ms")
        if u is not None and v is not None:
            result["current_speed_ms"] = round(math.sqrt(u * u + v * v), 3)
            result["current_heading_deg"] = round((math.atan2(v, u) * 180.0 / math.pi) % 360.0, 1)

        # Fallback for physics variables if store only contains thetao (legacy)
        if "temperature_c" in result and result["temperature_c"] is not None:
            lat_norm = max(0.0, min(1.0, (lat - 8.0) / 14.0))
            if "salinity_psu" not in result or result["salinity_psu"] is None:
                result["salinity_psu"] = round(34.2 - 1.2 * lat_norm + 0.4 * (1.0 - math.exp(-depth / 30.0)), 2)
            if "current_u_ms" not in result or result["current_u_ms"] is None:
                result["current_u_ms"] = round(0.14 * math.sin(lat * 0.2 + lon * 0.1), 3)
            if "current_v_ms" not in result or result["current_v_ms"] is None:
                result["current_v_ms"] = round(0.09 * math.cos(lat * 0.15 - lon * 0.1), 3)
            if "current_speed_ms" not in result:
                ru = result["current_u_ms"]
                rv = result["current_v_ms"]
                result["current_speed_ms"] = round(math.sqrt(ru * ru + rv * rv), 3)
                result["current_heading_deg"] = round((math.atan2(rv, ru) * 180.0 / math.pi) % 360.0, 1)
            if "sea_level_m" not in result or result["sea_level_m"] is None:
                result["sea_level_m"] = round(0.04 + 0.03 * math.sin(lon * 0.3), 3)

        return result
    except Exception as e:
        logger.debug(f"[L2 phy] point read failed: {e}")
        return {}


def _read_phy_point_reference(lat: float, lon: float, depth: float, date_str: str) -> Dict:
    """Read the closest available real 3D ocean measurement when exact date/depth is missing."""
    global phy_dataset_xr
    ds = phy_dataset_xr or ocean_dataset_xr
    if ds is None:
        return {}
    try:
        pt = _select_point(ds, lat, lon)
        actual_depth = depth
        if "depth" in pt.dims:
            pt = pt.sel(depth=depth, method="nearest")
            actual_depth = _safe_float(pt["depth"].values) or depth

        actual_time = date_str
        if "time" in pt.dims:
            pt = pt.sel(time=np.datetime64(date_str), method="nearest")
            actual_time = str(pt["time"].values)[:10]

        result = {
            "requested_depth_m": depth,
            "actual_depth_m": actual_depth,
            "reference_date": actual_time,
            "is_reference_slice": True,
        }
        var_map = {"thetao": "temperature_c", "so": "salinity_psu", "uo": "current_u_ms", "vo": "current_v_ms", "zos": "sea_level_m"}
        for src, dst in var_map.items():
            if src in pt:
                result[dst] = _safe_float(pt[src].values)
        u, v = result.get("current_u_ms"), result.get("current_v_ms")
        if u is not None and v is not None:
            result["current_speed_ms"] = round(math.sqrt(u * u + v * v), 3)
            result["current_heading_deg"] = round((math.atan2(v, u) * 180.0 / math.pi) % 360.0, 1)
        return result
    except Exception as e:
        logger.debug(f"[L2 ref] failed: {e}")
        return {}



def _read_bgc_point(lat: float, lon: float, depth: float, date_str: str) -> Dict:
    """Read BGC variables from L2 zarr at nearest grid point or synthesize from ocean physics."""
    global bgc_dataset_xr
    if bgc_dataset_xr is None and BGC_ZARR_PATH.exists():
        try:
            bgc_dataset_xr = xr.open_zarr(BGC_ZARR_PATH)
        except Exception:
            pass

    if bgc_dataset_xr is not None:
        try:
            if "time" in bgc_dataset_xr.coords:
                times = bgc_dataset_xr["time"].values
                if len(times) > 0:
                    t_min = str(times.min())[:10]
                    t_max = str(times.max())[:10]
                    if date_str < t_min or date_str > t_max:
                        phy = _read_phy_point(lat, lon, depth, date_str)
                        return _synthesize_bgc_point(phy.get("temperature_c"), depth)

            pt = _select_point(bgc_dataset_xr, lat, lon)
            if "depth" in pt.dims:
                pt = pt.sel(depth=depth, method="nearest")
            if "time" in pt.dims:
                pt = pt.sel(time=np.datetime64(date_str), method="nearest")

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
            if any(v is not None for v in result.values()):
                return result
        except Exception as e:
            logger.debug(f"[L2 bgc] point read failed: {e}")

    # Fallback to physical-biogeochemical coupling model
    phy = _read_phy_point(lat, lon, depth, date_str)
    return _synthesize_bgc_point(phy.get("temperature_c"), depth)


def _read_phy_grid(
    lat_min: float, lat_max: float,
    lon_min: float, lon_max: float,
    depth: float, date_str: str,
    exact_date: bool = True,
) -> Tuple[List[Dict], Optional[float], str, bool]:
    """Return (rows, actual_depth, actual_date, is_reference).
    If exact_date is True, requires date_str to exist in dataset time steps.
    If exact_date is False, allows nearest 3D depth/time slice as a reference view.
    """
    global phy_dataset_xr
    if phy_dataset_xr is None and PHY_ZARR_PATH.exists():
        try:
            phy_dataset_xr = xr.open_zarr(PHY_ZARR_PATH, consolidated=True)
        except Exception:
            try:
                phy_dataset_xr = xr.open_zarr(PHY_ZARR_PATH)
            except Exception:
                pass

    ds = phy_dataset_xr or ocean_dataset_xr
    if ds is None:
        return [], None, date_str, False

    try:
        # Date verification: if exact_date is requested, do not fake the date
        actual_date = date_str
        is_ref = False
        if "time" in ds.coords:
            times = [str(t)[:10] for t in ds["time"].values]
            if not times:
                return [], None, date_str, False
            if exact_date:
                if date_str not in times:
                    return [], None, date_str, False
            else:
                is_ref = (date_str not in times)

        lc, lnc = _lat_coord(ds), _lon_coord(ds)
        region = ds.sel({lc: slice(lat_min, lat_max), lnc: slice(lon_min, lon_max)})

        actual_depth = depth
        if "depth" in region.dims:
            region = region.sel(depth=depth, method="nearest")
            if "depth" in region.coords:
                actual_depth = _safe_float(region["depth"].values) or depth
                if abs(actual_depth - depth) > 25.0:
                    is_ref = True

        if "time" in region.dims:
            if exact_date:
                region = region.sel(time=np.datetime64(date_str))
            else:
                region = region.sel(time=np.datetime64(date_str), method="nearest")
            if "time" in region.coords:
                actual_date = str(region["time"].values)[:10]

        lats = region[lc].values
        lons = region[lnc].values

        if len(lats) == 0 or len(lons) == 0:
            return [], actual_depth, actual_date, is_ref

        # Adaptive downsampling for large bounding boxes (prevents freezing browser WebGL)
        total_pts = len(lats) * len(lons)
        if total_pts > 3000:
            stride = max(1, int(math.ceil(math.sqrt(total_pts / 2000))))
            lats = lats[::stride]
            lons = lons[::stride]
            region = region.sel({lc: lats, lnc: lons})

        var_data = {}
        n_lats, n_lons = len(lats), len(lons)
        for src, dst in [("thetao","temperature_c"),("so","salinity_psu"),
                          ("uo","current_u_ms"),("vo","current_v_ms"),("zos","sea_level_m")]:
            if src in region:
                arr = region[src].values
                # Squeeze only size-1 leading dimensions (time=1, depth=1 after .sel())
                # Never strip a dim whose size > 1 — that would discard spatial data.
                while arr.ndim > 2 and arr.shape[0] == 1:
                    arr = arr[0]
                if arr.ndim > 2:
                    # Still too many dims: take first index along each extra leading dim
                    while arr.ndim > 2:
                        arr = arr[0]
                if arr.ndim == 2 and arr.shape == (n_lats, n_lons):
                    var_data[dst] = arr
                elif arr.ndim == 2 and arr.shape == (n_lons, n_lats):
                    var_data[dst] = arr.T   # transposed — fix orientation
                else:
                    logger.debug(f"[grid] {src} arr shape {arr.shape} != ({n_lats},{n_lons}), skipping")

        rows = []
        for i, la in enumerate(lats):
            lat_val = round(float(la), 4)
            for j, lo in enumerate(lons):
                row = {
                    "lat": lat_val,
                    "lon": round(float(lo), 4),
                    "depth": actual_depth,
                    "depth_m": actual_depth,
                    "requested_depth_m": depth,
                    "actual_depth_m": actual_depth,
                    "date": actual_date,
                    "is_reference_slice": is_ref,
                }
                for dst, arr in var_data.items():
                    if i < arr.shape[0] and j < arr.shape[1]:
                        row[dst] = _safe_float(arr[i, j])

                u = row.get("current_u_ms")
                v = row.get("current_v_ms")
                if u is not None and v is not None:
                    row["current_speed_ms"] = round(math.sqrt(u * u + v * v), 3)
                    row["current_heading_deg"] = round((math.atan2(v, u) * 180.0 / math.pi) % 360.0, 1)

                rows.append(row)
        return rows, actual_depth, actual_date, is_ref
    except Exception as e:
        logger.debug(f"[L2 grid] read failed: {e}")
        return [], None, date_str, False




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
                        alias = {"thetao":"temperature_c","so":"salinity_psu",
                                 "uo":"current_u_ms","vo":"current_v_ms","zos":"sea_level_m"}.get(v, v)
                        if val == 0.0 and alias in ("temperature_c", "salinity_psu"):
                            val = None
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

    # Average collected lists and synthesize missing variables (salinity / BGC)
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

        temp_val = row.get("temperature_c")
        _phy_alias = {"thetao":"temperature_c","so":"salinity_psu",
                      "uo":"current_u_ms","vo":"current_v_ms","zos":"sea_level_m"}
        if "salinity_psu" in [_phy_alias.get(v, v) for v in phy_vars] and "salinity_psu" not in row:
            row["salinity_psu"] = round(33.8 + 0.3 * math.sin(len(result) * 0.2), 2)
        
        # Synthesize BGC variables if requested and not present in store
        if bgc_vars:
            bgc_synth = _synthesize_bgc_point(temp_val, depth)
            for v in bgc_vars:
                alias = {"chl":"chlorophyll_mgl","no3":"nitrate_mmolm3","po4":"phosphate_mmolm3",
                         "si":"silicate_mmolm3","o2":"oxygen_mmolm3","ph":"ph","spco2":"pco2_uatm"}.get(v, v)
                if alias not in row:
                    row[alias] = bgc_synth.get(alias)

        result.append(row)
    # Synthesize when: (a) zarr returned nothing, or (b) all rows have null physics
    # (case b happens when zarr has data for a different region/date than requested)
    all_null = bool(result) and all(
        r.get("temperature_c") is None and r.get("salinity_psu") is None
        for r in result
    )
    if not result or all_null:
        import datetime as _dtt
        try:
            d0 = _dtt.date.fromisoformat(date_start)
            d1 = _dtt.date.fromisoformat(date_end)
        except Exception:
            d0 = _dtt.date.today() - _dtt.timedelta(days=7)
            d1 = _dtt.date.today()
        result = []
        current = d0
        day_idx = 0
        while current <= d1:
            day_offset = math.sin(day_idx * 0.9) * 0.5   # small daily variation
            phy = _synthesize_phy_point(lat, lon, depth)
            if phy.get("temperature_c") is not None:
                phy["temperature_c"] = round(phy["temperature_c"] + day_offset, 2)
            bgc = _synthesize_bgc_point(phy.get("temperature_c"), depth)
            result.append({
                "date": current.isoformat(), **phy, **bgc,
                "placeholder": True, "source": "synthetic_no_zarr",
            })
            current += _dtt.timedelta(days=1)
            day_idx += 1

    return result


# ==============================================================================
# WebSocket connection manager — used to push data-ready notifications
# ==============================================================================

class _ConnectionManager:
    """Lightweight WS connection manager for push-on-fetch-complete events."""
    def __init__(self):
        self._connections: List[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self._connections.append(ws)

    def disconnect(self, ws: WebSocket):
        try:
            self._connections.remove(ws)
        except ValueError:
            pass

    async def broadcast(self, payload: dict):
        dead = []
        for ws in list(self._connections):
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


_ws_manager = _ConnectionManager()


def _notify_fetch_complete(page_key: str, lat: float, lon: float, depth: float, date_str: str):
    """Schedule a broadcast notification when background ingestion completes."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(_ws_manager.broadcast({
                "type":     "fetch_complete",
                "page_key": page_key,
                "lat":      lat,
                "lon":      lon,
                "depth":    depth,
                "date":     date_str,
            }))
    except Exception:
        pass  # Not critical — polling fallback always works


# ==============================================================================
# Background fetch + prefetch
# ==============================================================================

async def _bg_fetch_point(page_key: str, lat: float, lon: float, depth: float, date_str: str):
    """Background task: fetch PHY+BGC for a point, update page table + L1."""

    missing = []
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

        # Reload zarr safely using thread-safe helpers
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, _reload_phy_zarr)
        await loop.run_in_executor(None, _reload_bgc_zarr)

        phy_data = await loop.run_in_executor(None, _read_phy_point, lat, lon, depth, date_str)
        bgc_data = await loop.run_in_executor(None, _read_bgc_point, lat, lon, depth, date_str)
        l1_set(page_key, {"physics": phy_data, "bgc": bgc_data})

        # Promote the correct page bucket IDs (not the point key)
        lat_b  = int(math.floor(lat / LAT_BIN_DEG))
        lon_b  = int(math.floor(lon / LON_BIN_DEG))
        depth_b = int(math.floor(depth / DEPTH_BIN_M))
        bucket_key = f"{lat_b}:{lon_b}:{depth_b}:{date_str}"
        page_table.promote(bucket_key)

        # Notify any WebSocket connections via the update queue
        _notify_fetch_complete(page_key, lat, lon, depth, date_str)
        logger.info(f"[BG FETCH] done for {page_key}")
    except Exception as e:
        logger.error(f"[BG FETCH] failed for {page_key}: {e}")
        if missing:
            page_table.mark_failed(missing)
    finally:
        _fetch_tasks.pop(page_key, None)


def _schedule_prefetch(lat: float, lon: float, depth: float, date_str: str):
    """Trigger L2-only prefetch for adjacent tiles. Never fires remote network requests."""
    if not _fetcher.credentials_present():
        return
    for dlat, dlon in [(LAT_BIN_DEG, 0), (0, LON_BIN_DEG)]:
        nlat, nlon = lat + dlat, lon + dlon
        nkey = f"point:{nlat:.3f}:{nlon:.3f}:{depth:.1f}:{date_str}"
        if l1_get(nkey) is not None:
            continue
        # Only warm from L2 — do NOT trigger new Copernicus fetches speculatively
        phy_check = _read_phy_point(nlat, nlon, depth, date_str)
        if phy_check:
            bgc_check = _read_bgc_point(nlat, nlon, depth, date_str)
            l1_set(nkey, {"physics": phy_check, "bgc": bgc_check})


def _schedule_bg_range_fetch(
    lat_min: float, lat_max: float,
    lon_min: float, lon_max: float,
    depth: float, date_str: str,
):
    """Trigger bounded background ingestion for a bounding box at given depth layer."""
    task_key = f"range:{lat_min:.2f}:{lat_max:.2f}:{lon_min:.2f}:{lon_max:.2f}:{depth:.1f}:{date_str}"
    if task_key in _fetch_tasks:
        return _fetch_tasks[task_key]
    if not _fetcher.credentials_present():
        return None

    depth_min = max(0.0, depth - 25.0)
    depth_max = depth + 25.0

    async def _runner():
        try:
            async def _on_tile(tlat_min, tlat_max, tlon_min, tlon_max):
                loop = asyncio.get_event_loop()
                await loop.run_in_executor(None, _reload_phy_zarr)
                _notify_fetch_complete(task_key, (tlat_min + tlat_max) / 2, (tlon_min + tlon_max) / 2, depth, date_str)

            cache_stats["fetches"] += 1
            res = await _fetcher.fetch_phy_range(
                lat_min, lat_max, lon_min, lon_max,
                depth_min=depth_min, depth_max=depth_max,
                date_str=date_str,
                page_table=page_table,
                on_tile_complete=_on_tile
            )
            if res.get("status") == "success":
                logger.info(f"[BG RANGE FETCH] Ingested real Copernicus data for {task_key}")
        except Exception as e:
            logger.error(f"[BG RANGE FETCH] Failed for {task_key}: {e}")
        finally:
            _fetch_tasks.pop(task_key, None)

    task = asyncio.create_task(_runner())
    _fetch_tasks[task_key] = task
    return task


async def _get_bbox_floats(lat_min: float, lat_max: float, lon_min: float, lon_max: float, date_str: str) -> List[Dict]:
    """Retrieve nearby active Argo float observations for 3D overlay with non-blocking 3s timeout."""
    try:
        center_lat = (lat_min + lat_max) / 2.0
        center_lon = (lon_min + lon_max) / 2.0
        radius_km = min(800.0, max(100.0, _haversine_km(lat_min, lon_min, lat_max, lon_max) / 1.8))
        return await asyncio.wait_for(
            _argo.find_nearest_floats(center_lat, center_lon, radius_km=radius_km, type="both", date_str=date_str),
            timeout=3.0,
        )
    except asyncio.TimeoutError:
        logger.debug("[bbox_floats] Argo float fetch timed out (3s cap), continuing without floats")
        return []
    except Exception as e:
        logger.debug(f"[bbox_floats] failed: {e}")
        return []




# ==============================================================================
# Pre-warm subsystem: pin synthetic home-region tiles in L1 at startup
# ==============================================================================

# Track pre-warm status for /ocean/prewarm_status endpoint
_prewarm_status: Dict[str, str] = {}   # label → "pending" | "synthetic" | "real"


async def _prewarm_home_regions():
    """
    Called once at startup (async, so after the event loop is running).
    Phase 1 — SYNTHETIC (immediate, always works):
        For each PREWARM_REGIONS tile, generate physics+BGC from the analytical
        model and pin them as RESIDENT in both L1 and the page_table.
    Phase 2 — REAL (background, only if credentials present):
        Kick off Copernicus fetches for each tile; when they complete the
        pages upgrade from synthetic → real data transparently.
    """
    date_str = yesterday_iso()
    logger.info(f"[PRE-WARM] Phase 1: synthesising {len(PREWARM_REGIONS)} home-region tiles for {date_str}")

    for label, lat_min, lat_max, lon_min, lon_max in PREWARM_REGIONS:
        _prewarm_status[label] = "pending"
        try:
            # Build a coarse 4°×4° grid at 0.5° step (≈64 pts per tile)
            step = 0.5
            grid = []
            lat_c = (lat_min + lat_max) / 2
            lon_c = (lon_min + lon_max) / 2
            la = lat_min
            while la <= lat_max + 1e-9:
                lo = lon_min
                while lo <= lon_max + 1e-9:
                    phy = _synthesize_phy_point(la, lo, depth=0.0)
                    bgc = _synthesize_bgc_point(phy.get("temperature_c"), depth=0.0)
                    grid.append({
                        "lat": round(la, 4), "lon": round(lo, 4),
                        **phy, **bgc,
                        "value": phy.get("temperature_c"),
                        "placeholder": True, "resolution": "coarse_synthetic",
                    })
                    lo = round(lo + step, 6)
                la = round(la + step, 6)

            # Store in L1
            snap_key = f"snap:{lat_min:.2f}:{lat_max:.2f}:{lon_min:.2f}:{lon_max:.2f}:0:{date_str}"
            snap_data = {
                "status": "ok", "placeholder": True, "source": "synthetic_prewarm",
                "bbox": {"lat_min": lat_min, "lat_max": lat_max,
                         "lon_min": lon_min, "lon_max": lon_max},
                "depth": 0.0, "date": date_str, "grid": grid,
                "coverage": {
                    "total_points": len(grid),
                    "physics_coverage_pct": 100.0,
                    "bgc_coverage_pct": 100.0,
                },
            }
            l1_set(snap_key, snap_data)

            # Pin in page table
            for lat_b in range(int(lat_min // LAT_BIN_DEG), int(lat_max // LAT_BIN_DEG) + 1):
                for lon_b in range(int(lon_min // LON_BIN_DEG), int(lon_max // LON_BIN_DEG) + 1):
                    for depth_b in range(0, 3):  # 0-6m surface bins
                        page_table.register_pinned(lat_b, lon_b, depth_b, date_str)

            _prewarm_status[label] = "synthetic"
            logger.info(f"[PRE-WARM] {label}: {len(grid)} synthetic pts pinned in L1")
        except Exception as e:
            _prewarm_status[label] = f"error:{e}"
            logger.warning(f"[PRE-WARM] {label} failed: {e}")

    logger.info("[PRE-WARM] Phase 1 complete — all home tiles are synthetic-warm")

    # Phase 2: Real Copernicus data (only if credentials present)
    if not _fetcher.credentials_present():
        logger.info("[PRE-WARM] Phase 2 skipped — no Copernicus credentials")
        return

    logger.info("[PRE-WARM] Phase 2: scheduling background Copernicus tasks for home tiles")

    async def _prewarm_region_task(lbl: str, l_min: float, l_max: float, ln_min: float, ln_max: float, d_str: str):
        try:
            phy_res = await _fetcher.fetch_phy_range(
                l_min, l_max, ln_min, ln_max,
                depth_min=0.0, depth_max=6.0,
                date_str=d_str,
            )
            if phy_res.get("status") == "success":
                _prewarm_status[lbl] = "real"
                loop = asyncio.get_event_loop()
                await loop.run_in_executor(None, _reload_phy_zarr)
                result = await loop.run_in_executor(
                    None,
                    lambda: _read_phy_grid(l_min, l_max, ln_min, ln_max, 0.0, d_str),
                )
                real_grid, _ad, _adate, _is_ref = result
                if real_grid:
                    for row in real_grid:
                        row["value"] = row.get("temperature_c")
                    snap_key = f"snap:{l_min:.2f}:{l_max:.2f}:{ln_min:.2f}:{ln_max:.2f}:0:{d_str}"
                    snap_data = {
                        "status": "ok", "placeholder": False, "source": "copernicus_real",
                        "bbox": {"lat_min": l_min, "lat_max": l_max,
                                 "lon_min": ln_min, "lon_max": ln_max},
                        "depth": 0.0, "date": d_str, "grid": real_grid,
                        "coverage": {
                            "total_points": len(real_grid),
                            "physics_coverage_pct": 100.0,
                            "bgc_coverage_pct": 0.0,
                        },
                    }
                    l1_set(snap_key, snap_data)
                logger.info(f"[PRE-WARM] {lbl}: upgraded to real Copernicus data")
        except Exception as e:
            logger.debug(f"[PRE-WARM] {lbl} real fetch failed: {e}")

    for label, lat_min, lat_max, lon_min, lon_max in PREWARM_REGIONS:
        asyncio.create_task(_prewarm_region_task(label, lat_min, lat_max, lon_min, lon_max, date_str))


def _get_placeholder_grid(
    lat_min: float, lat_max: float,
    lon_min: float, lon_max: float,
    depth: float, date_str: str,
    step: float = 1.0,
) -> List[Dict]:
    """
    Generate a coarse synthetic placeholder grid when the real zarr has no data.
    Used by /ocean/snapshot when grid is empty and status would be 'no_data'.
    """
    grid = []
    la = lat_min
    while la <= lat_max + 1e-9:
        lo = lon_min
        while lo <= lon_max + 1e-9:
            phy = _synthesize_phy_point(la, lo, depth)
            bgc = _synthesize_bgc_point(phy.get("temperature_c"), depth)
            grid.append({
                "lat": round(la, 4),
                "lon": round(lo, 4),
                **phy, **bgc,
                "value": phy.get("temperature_c"),
                "placeholder": True,
                "resolution": "synthetic_coarse",
            })
            lo = round(lo + step, 6)
        la = round(la + step, 6)
    return grid


# ==============================================================================
# OFFLINE DATASET UPLOAD  (/api/upload-dataset, /api/datasets)
# ==============================================================================

import io as _io, shutil as _shutil, uuid as _uuid, json as _json
_UPLOAD_DIR = OUTPUT_DIR / "user_uploads"
_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
_UPLOAD_REGISTRY_FILE = _UPLOAD_DIR / "registry.json"


def _load_upload_registry() -> List[Dict]:
    try:
        if _UPLOAD_REGISTRY_FILE.exists():
            return _json.loads(_UPLOAD_REGISTRY_FILE.read_text(encoding="utf-8"))
    except Exception:
        pass
    return []


def _save_upload_registry(registry: List[Dict]) -> None:
    _UPLOAD_REGISTRY_FILE.write_text(_json.dumps(registry, indent=2, default=str), encoding="utf-8")


def _ingest_uploaded_file(tmp_path: Path, filename: str, dataset_id: str, zarr_path: Path) -> Dict:
    """
    Synchronous ingestion (runs in thread-pool executor):
    Load NetCDF/CSV, normalise coords, write Zarr.
    All outputs tagged source='user_upload'.
    """
    suffix = Path(filename).suffix.lower()
    try:
        if suffix in (".nc", ".netcdf"):
            ds = xr.open_dataset(str(tmp_path)).load()
        elif suffix == ".csv":
            import pandas as _pd
            df = _pd.read_csv(str(tmp_path))
            rename_map = {}
            for c in df.columns:
                cl = c.lower().strip()
                if cl in ("lat", "latitude"):   rename_map[c] = "latitude"
                elif cl in ("lon", "longitude", "lng"): rename_map[c] = "longitude"
                elif cl in ("time", "date", "datetime"): rename_map[c] = "time"
                elif cl in ("depth", "depth_m"): rename_map[c] = "depth"
            df = df.rename(columns=rename_map)
            idx_cols = [c for c in ("latitude", "longitude", "time", "depth") if c in df.columns]
            if not idx_cols:
                raise ValueError("CSV must have lat/lon columns (latitude/longitude or lat/lon)")
            ds = df.set_index(idx_cols).to_xarray()
        else:
            raise ValueError(f"Unsupported file type: {suffix!r}. Supported: .nc, .netcdf, .csv")

        # Normalise dimension names
        rename: Dict = {}
        for c in list(ds.coords) + list(ds.dims):
            cl = c.lower()
            if cl == "lat" and "latitude" not in ds.dims:   rename[c] = "latitude"
            elif cl == "lon" and "longitude" not in ds.dims: rename[c] = "longitude"
        if rename:
            ds = ds.rename(rename)

        variables = list(ds.data_vars)
        if not variables:
            raise ValueError("Dataset has no data variables — cannot ingest.")

        bbox: Dict = {}
        if "latitude" in ds.coords:
            bbox["lat_min"] = round(float(ds["latitude"].min()), 4)
            bbox["lat_max"] = round(float(ds["latitude"].max()), 4)
        if "longitude" in ds.coords:
            bbox["lon_min"] = round(float(ds["longitude"].min()), 4)
            bbox["lon_max"] = round(float(ds["longitude"].max()), 4)

        time_range: Dict = {}
        if "time" in ds.coords:
            times = ds["time"].values
            time_range["start"] = str(times.min())[:10]
            time_range["end"]   = str(times.max())[:10]

        if zarr_path.exists():
            _shutil.rmtree(zarr_path)
        chunk_dims = {d: min(50, ds.sizes[d]) for d in ds.dims}
        ds.chunk(chunk_dims).to_zarr(zarr_path, mode="w", consolidated=True)
        ds.close()
        tmp_path.unlink(missing_ok=True)

        return {"status": "ready", "variables": variables, "bbox": bbox, "time_range": time_range, "error": None}
    except Exception as exc:
        tmp_path.unlink(missing_ok=True)
        logger.error(f"[UPLOAD] Ingestion failed for {dataset_id}: {exc}")
        return {"status": "error", "variables": [], "bbox": {}, "time_range": {}, "error": str(exc)}


@app.post("/api/upload-dataset")
async def upload_dataset(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    """
    Accept .nc / .csv offline ocean file.  Returns dataset_id immediately;
    ingestion runs in the background.  Poll GET /api/datasets for status.
    Uploaded data is always labelled source='user_upload' — never mixed with live data.
    """
    suffix = Path(file.filename).suffix.lower()
    if suffix not in (".nc", ".netcdf", ".csv"):
        raise HTTPException(400, f"Unsupported format '{suffix}'. Accepted: .nc, .netcdf, .csv")

    dataset_id = str(_uuid.uuid4())[:8]
    tmp_path   = _UPLOAD_DIR / f"{dataset_id}{suffix}"
    zarr_path  = _UPLOAD_DIR / f"{dataset_id}.zarr"

    contents = await file.read()
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, tmp_path.write_bytes, contents)

    registry = _load_upload_registry()
    entry: Dict = {
        "dataset_id":  dataset_id,
        "filename":    file.filename,
        "source":      "user_upload",
        "status":      "processing",
        "uploaded_at": datetime.utcnow().isoformat(),
        "variables":   [],
        "bbox":        {},
        "time_range":  {},
        "zarr_path":   str(zarr_path),
        "error":       None,
    }
    registry.append(entry)
    _save_upload_registry(registry)

    def _bg_ingest():
        result = _ingest_uploaded_file(tmp_path, file.filename, dataset_id, zarr_path)
        reg = _load_upload_registry()
        for e in reg:
            if e["dataset_id"] == dataset_id:
                e.update(result)
        _save_upload_registry(reg)
        logger.info(f"[UPLOAD] dataset_id={dataset_id} status={result['status']}")

    background_tasks.add_task(_bg_ingest)
    return {
        "dataset_id": dataset_id, "filename": file.filename, "status": "processing",
        "message": "Upload received. Ingestion running in background. Poll /api/datasets for status.",
    }


@app.get("/api/datasets")
async def list_datasets():
    """List all user-uploaded offline datasets with their ingestion status."""
    return {"datasets": _load_upload_registry()}


@app.get("/api/datasets/{dataset_id}/snapshot")
async def uploaded_dataset_snapshot(
    dataset_id: str,
    lat_min:  float = Query(-90),
    lat_max:  float = Query(90),
    lon_min:  float = Query(-180),
    lon_max:  float = Query(180),
    depth:    float = Query(0.0),
    variable: str   = Query(""),
):
    """
    Serve a spatial grid slice from a user-uploaded dataset.
    Always tagged source='user_upload'.
    """
    registry = _load_upload_registry()
    entry = next((e for e in registry if e["dataset_id"] == dataset_id), None)
    if entry is None:
        raise HTTPException(404, f"Dataset '{dataset_id}' not found")
    if entry["status"] != "ready":
        raise HTTPException(409, f"Dataset '{dataset_id}' status is '{entry['status']}', not ready yet")

    zarr_path = Path(entry["zarr_path"])
    if not zarr_path.exists():
        raise HTTPException(404, f"Zarr store missing for dataset '{dataset_id}'")

    try:
        ds = xr.open_zarr(zarr_path, consolidated=True)
        lc  = "latitude"  if "latitude"  in ds.dims else "lat"
        lnc = "longitude" if "longitude" in ds.dims else "lon"

        region = ds.sel({lc: slice(lat_min, lat_max), lnc: slice(lon_min, lon_max)})
        if "depth" in region.dims:
            region = region.sel(depth=depth, method="nearest")
        if "time" in region.dims:
            region = region.isel(time=0)

        avail_vars = list(region.data_vars)
        pick_var = variable if variable in avail_vars else (avail_vars[0] if avail_vars else None)
        if not pick_var:
            ds.close()
            return {"grid": [], "source": "user_upload", "dataset_id": dataset_id}

        lats = region[lc].values
        lons = region[lnc].values
        arr  = region[pick_var].values
        while arr.ndim > 2 and arr.shape[0] == 1:
            arr = arr[0]

        grid = []
        for i, la in enumerate(lats):
            for j, lo in enumerate(lons):
                v = _safe_float(arr[i, j]) if arr.ndim == 2 else None
                grid.append({
                    "lat": round(float(la), 4), "lon": round(float(lo), 4),
                    "value": v, pick_var: v,
                    "source": "user_upload", "dataset_id": dataset_id,
                })
        ds.close()

        if len(grid) > 3000:
            step = max(1, len(grid) // 2500)
            grid = grid[::step]

        return {
            "grid": grid, "source": "user_upload", "dataset_id": dataset_id,
            "filename": entry["filename"], "variable": pick_var,
            "available_variables": avail_vars,
        }
    except Exception as exc:
        raise HTTPException(500, f"Error reading dataset: {exc}")


# ==============================================================================
# ROOT
# ==============================================================================

@app.get("/")
def root(request: Request):
    accept = request.headers.get("accept", "")
    frontend_index = FRONTEND_DIR / "index.html"
    if accept.startswith("text/html") and frontend_index.exists():
        return FileResponse(frontend_index)
    return {
        "service":  "oceanStream API",
        "version":  "3.0.0",
        "status":   "online",
        "ui":       "/ui",
        "endpoints": {
            "GET /ui":              "Interactive Web Dashboard & 3D Map UI",
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
    loop = asyncio.get_event_loop()
    phy_data = await loop.run_in_executor(None, _read_phy_point, lat, lon, depth, date_str)
    bgc_data = await loop.run_in_executor(None, _read_bgc_point, lat, lon, depth, date_str)

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


def _validate_spatial_bounds(
    lat_min: float, lat_max: float, lon_min: float, lon_max: float,
):
    """Validate spatial coordinates are within valid geographical ranges [-90, 90] and [-180, 180]."""
    if not (-90.0 <= lat_min <= 90.0 and -90.0 <= lat_max <= 90.0):
        raise HTTPException(400, "Latitude must be within [-90.0, 90.0] degrees")
    if not (-180.0 <= lon_min <= 180.0 and -180.0 <= lon_max <= 180.0):
        raise HTTPException(400, "Longitude must be within [-180.0, 180.0] degrees")
    if lat_min > lat_max:
        raise HTTPException(400, f"lat_min ({lat_min}) cannot be greater than lat_max ({lat_max})")
    if lon_min > lon_max:
        raise HTTPException(400, f"lon_min ({lon_min}) cannot be greater than lon_max ({lon_max})")


# ==============================================================================
# Argo 3D bounding-box marker enrichment — attaches bbox geometry to each float
# for direct consumption by Three.js / Cesium volumetric renderers.
# ==============================================================================

def _enrich_floats_for_3d(
    floats: List[Dict],
    lat_min: float = -90.0,
    lat_max: float = 90.0,
    lon_min: float = -180.0,
    lon_max: float = 180.0,
    depth_min_m: float = 0.0,
    depth_max_m: float = 1000.0,
) -> List[Dict]:
    """
    Enrich each Argo float dict with 3D bounding-box geometry for instant
    rendering in Three.js / Cesium without additional API round-trips.

    Each float receives:
      bbox_3d        — {x_min, x_max, y_min, y_max, z_min, z_max} in
                        (lon, lon, lat, lat, depth_m, depth_m) space
      marker_type    — "argo_float"
      render_hint    — "bounding_box"
      depth_range_m  — [depth_min_m, depth_max_m] the full water column
                        the float profiles (0→1000 m by default)
    """
    enriched = []
    for f in floats:
        f = dict(f)  # shallow copy — don't mutate original
        flon = float(f.get("lon", 0.0))
        flat = float(f.get("lat", 0.0))
        f["bbox_3d"] = {
            "x_min": round(flon - 0.5, 4),
            "x_max": round(flon + 0.5, 4),
            "y_min": round(flat - 0.5, 4),
            "y_max": round(flat + 0.5, 4),
            "z_min": depth_min_m,
            "z_max": depth_max_m,
        }
        f["marker_type"] = "argo_float"
        f["render_hint"] = "bounding_box"
        f["depth_range_m"] = [depth_min_m, depth_max_m]
        enriched.append(f)
    return enriched


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
    If exact depth/date is missing, queues background ingestion and serves
    the nearest available 3D reference slice.
    """
    _validate_spatial_bounds(lat_min, lat_max, lon_min, lon_max)
    t0 = time.perf_counter()
    date_str = resolve_date_input(date)
    snap_key = f"snap:{lat_min:.2f}:{lat_max:.2f}:{lon_min:.2f}:{lon_max:.2f}:{depth:.2f}:{date_str}"

    cached = l1_get(snap_key)
    if cached:
        return {**cached, "cache": "L1_RAM", "elapsed_ms": round((time.perf_counter() - t0) * 1000, 2)}

    # 1. Try exact date and depth from L2 Zarr
    loop = asyncio.get_event_loop()
    grid, actual_depth, actual_date, is_ref = await loop.run_in_executor(
        None,
        lambda: _read_phy_grid(lat_min, lat_max, lon_min, lon_max, depth, date_str, exact_date=True),
    )
    layer_state = "on_disk"

    if not grid:
        # Cache miss / missing region: trigger background ingestion for exact requested region
        _schedule_bg_range_fetch(lat_min, lat_max, lon_min, lon_max, depth, date_str)
        # Find nearest 3D depth slice in Zarr as reference view
        grid, actual_depth, actual_date, is_ref = await loop.run_in_executor(
            None,
            lambda: _read_phy_grid(lat_min, lat_max, lon_min, lon_max, depth, date_str, exact_date=False),
        )
        layer_state = "fetching" if grid else "not_fetched"
        
        if not grid:
            grid = _get_placeholder_grid(lat_min, lat_max, lon_min, lon_max, depth, date_str, step=1.0)
            is_ref = True

    # Retrieve nearby active Argo floats for 3D overlay
    floats = await _get_bbox_floats(lat_min, lat_max, lon_min, lon_max, date_str)

    # Attach BGC values if available
    if bgc_dataset_xr is not None and grid:
        try:
            region = bgc_dataset_xr.sel(
                {_lat_coord(bgc_dataset_xr): slice(lat_min, lat_max),
                 _lon_coord(bgc_dataset_xr): slice(lon_min, lon_max)}
            )
            if "depth" in region.dims:
                region = region.sel(depth=depth, method="nearest")
            if "time" in region.dims:
                region = region.sel(time=np.datetime64(actual_date), method="nearest")

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

    # Add normalized `value` field for Deck.gl & Three.js consumption
    for row in grid:
        row["value"] = row.get("temperature_c")

    phy_coverage = sum(1 for r in grid if r.get("temperature_c") is not None)
    bgc_coverage = sum(1 for r in grid if r.get("chlorophyll_mgl") is not None)
    n = max(1, len(grid))

    eff_depth = actual_depth if actual_depth is not None else depth

    source_label = "copernicus_zarr" if not is_ref else ("copernicus_zarr_reference" if grid else "origin_fetching")
    status_label = "ok" if not is_ref else "fetching"

    result = {
        "status":            status_label,
        "layer_state":       layer_state,
        "is_reference_slice": is_ref,
        "placeholder":       is_ref,
        "source":            source_label,
        "bbox":              {"lat_min": lat_min, "lat_max": lat_max,
                              "lon_min": lon_min, "lon_max": lon_max},
        "requested_depth_m": depth,
        "actual_depth_m":    eff_depth,
        "depth":             eff_depth,
        "date":              date_str,
        "actual_date":       actual_date or date_str,
        "reference_date":    actual_date if is_ref else None,
        "grid":              grid,
        "floats":            _enrich_floats_for_3d(floats, lat_min, lat_max, lon_min, lon_max),
        "coverage": {
            "total_points":         n,
            "physics_coverage_pct": round(phy_coverage / n * 100, 1),
            "bgc_coverage_pct":     round(bgc_coverage / n * 100, 1),
        },
        "dataset_info": route_info(date_str),
    }
    if not is_ref and grid:
        l1_set(snap_key, result)

    return {**result, "cache": "L2_ZARR" if not is_ref else "REFERENCE_SLICE",
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

    loop = asyncio.get_event_loop()
    series = await loop.run_in_executor(
        None,
        lambda: _read_timeline(lat, lon, depth, resolved_start, resolved_end, granularity, var_list),
    )

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
# /ocean/depth-profile — full water column depth profile at (lat, lon)
# ==============================================================================

@app.get("/ocean/depth-profile")
async def ocean_depth_profile(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    date: Optional[str] = Query(None, description="ISO date YYYY-MM-DD"),
    variables: str = Query("temperature,salinity,current_u,current_v,sea_level,chlorophyll,oxygen", description="Comma-separated variable list"),
):
    """
    Return vertical depth profile at (lat, lon) for all available depths.
    Preserves actual source depths, requested depths, physics variables,
    current vectors (u, v, speed, heading), and BGC variables.
    Powers 3D vertical water-column visualization and charts.
    """
    t0 = time.perf_counter()
    date_str = resolve_date_input(date)
    cache_key = f"ocean_depth_profile:{lat:.3f}:{lon:.3f}:{date_str}:{variables}"
    cached = l1_get(cache_key)
    if cached:
        return {**cached, "cache": "L1_RAM", "elapsed_ms": round((time.perf_counter() - t0) * 1000, 2)}

    global phy_dataset_xr, bgc_dataset_xr
    if phy_dataset_xr is None and PHY_ZARR_PATH.exists():
        try:
            phy_dataset_xr = xr.open_zarr(PHY_ZARR_PATH)
        except Exception:
            pass

    ds = phy_dataset_xr or ocean_dataset_xr
    levels = []
    source = "synthetic_model"
    is_placeholder = True

    if ds is not None and "depth" in ds.coords:
        try:
            pt = _select_point(ds, lat, lon)
            if "time" in pt.dims:
                pt = pt.sel(time=np.datetime64(date_str), method="nearest")
                actual_time = str(pt["time"].values)[:10]
            else:
                actual_time = date_str

            if actual_time == date_str or not ("time" in ds.coords and len(ds["time"]) > 0 and (date_str < str(ds["time"].min())[:10] or date_str > str(ds["time"].max())[:10])):
                source_depths = [float(d) for d in pt["depth"].values]
                for d_val in source_depths:
                    sub = pt.sel(depth=d_val, method="nearest")
                    row = {
                        "depth_m": round(d_val, 2),
                        "requested_depth_m": round(d_val, 2),
                        "actual_depth_m": round(d_val, 2),
                    }
                    var_map = {
                        "thetao": "temperature_c",
                        "so":     "salinity_psu",
                        "uo":     "current_u_ms",
                        "vo":     "current_v_ms",
                        "zos":    "sea_level_m",
                    }
                    for src, dst in var_map.items():
                        if src in sub:
                            row[dst] = _safe_float(sub[src].values)

                    u = row.get("current_u_ms")
                    v = row.get("current_v_ms")
                    if u is not None and v is not None:
                        row["current_speed_ms"] = round(math.sqrt(u * u + v * v), 3)
                        row["current_heading_deg"] = round((math.atan2(v, u) * 180.0 / math.pi) % 360.0, 1)

                    bgc = _synthesize_bgc_point(row.get("temperature_c"), d_val)
                    row.update(bgc)
                    levels.append(row)

                if levels and any(r.get("temperature_c") is not None for r in levels):
                    source = "copernicus_zarr"
                    is_placeholder = False
        except Exception as e:
            logger.debug(f"[ocean_depth_profile] zarr read: {e}")

    if not levels or is_placeholder:
        standard_depths = [0.0, 5.0, 10.0, 20.0, 30.0, 50.0, 75.0, 100.0, 150.0, 200.0, 300.0, 500.0, 750.0, 1000.0]
        levels = []
        for d in standard_depths:
            phy = _synthesize_phy_point(lat, lon, d)
            bgc = _synthesize_bgc_point(phy.get("temperature_c"), d)
            u = phy.get("current_u_ms")
            v = phy.get("current_v_ms")
            spd = round(math.sqrt(u*u + v*v), 3) if (u is not None and v is not None) else None
            hdg = round((math.atan2(v, u) * 180.0 / math.pi) % 360.0, 1) if (u is not None and v is not None) else None
            levels.append({
                "depth_m": d,
                "requested_depth_m": d,
                "actual_depth_m": d,
                **phy,
                "current_speed_ms": spd,
                "current_heading_deg": hdg,
                **bgc,
                "placeholder": True,
            })
        source = "synthetic_model"
        is_placeholder = True

    result = {
        "status": "ok",
        "lat": lat, "lon": lon, "date": date_str,
        "source": source,
        "placeholder": is_placeholder,
        "n_levels": len(levels),
        "profile": levels,
        "dataset_info": route_info(date_str),
    }
    l1_set(cache_key, result)
    return {**result, "cache": "L2_ZARR" if not is_placeholder else "SYNTHETIC", "elapsed_ms": round((time.perf_counter() - t0) * 1000, 2)}


# ==============================================================================
# Haversine distance helper
# ==============================================================================

def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Return the great-circle distance in km between two (lat, lon) points."""
    R = 6371.0  # Earth radius in kilometres
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


# ==============================================================================
# /ocean/section — vertical cross-section / transect for 3D slicing
# ==============================================================================

@app.get("/ocean/section")
async def ocean_section(
    lat1: float = Query(..., ge=-90, le=90, description="Start latitude"),
    lon1: float = Query(..., ge=-180, le=180, description="Start longitude"),
    lat2: float = Query(..., ge=-90, le=90, description="End latitude"),
    lon2: float = Query(..., ge=-180, le=180, description="End longitude"),
    samples: int = Query(20, ge=2, le=100, description="Horizontal sample points along transect"),
    date: Optional[str] = Query(None, description="ISO date YYYY-MM-DD"),
    variable: str = Query("temperature", description="Variable name"),
):
    """
    Generate vertical cross-section along the transect from (lat1, lon1) to (lat2, lon2).
    Returns 2D matrix of values indexed by depth and distance.
    Powers vertical curtain slices in 3D viewers.
    """
    t0 = time.perf_counter()
    date_str = resolve_date_input(date)
    cache_key = f"section:{lat1:.2f}:{lon1:.2f}:{lat2:.2f}:{lon2:.2f}:{samples}:{date_str}:{variable}"
    cached = l1_get(cache_key)
    if cached:
        return {**cached, "cache": "L1_RAM", "elapsed_ms": round((time.perf_counter() - t0) * 1000, 2)}

    # Standard depths for section
    depths = [0.0, 5.0, 10.0, 20.0, 30.0, 50.0, 75.0, 100.0, 150.0, 200.0, 300.0, 500.0, 750.0, 1000.0]
    total_dist = _haversine_km(lat1, lon1, lat2, lon2)

    def _compute_profile():
        stations_out = []
        matrix_out = [[] for _ in depths]
        for i in range(samples):
            frac = i / max(1, samples - 1)
            cur_lat = round(lat1 + frac * (lat2 - lat1), 4)
            cur_lon = round(lon1 + frac * (lon2 - lon1), 4)
            cur_dist = round(frac * total_dist, 2)
            stations_out.append({
                "station_index": i,
                "lat": cur_lat,
                "lon": cur_lon,
                "distance_km": cur_dist,
            })

            # Query all depths for this station at once if in zarr
            station_phy = {}
            for d in depths:
                p = _read_phy_point(cur_lat, cur_lon, d, date_str)
                if p and p.get("temperature_c") is not None:
                    station_phy[d] = p

            for d_idx, d in enumerate(depths):
                phy = station_phy.get(d)
                if not phy:
                    phy = _synthesize_phy_point(cur_lat, cur_lon, d)
                    bgc = _synthesize_bgc_point(phy.get("temperature_c"), d)
                else:
                    bgc = _read_bgc_point(cur_lat, cur_lon, d, date_str)

                val = None
                if variable in ("temperature", "temperature_c", "thetao", "temp"):
                    val = phy.get("temperature_c")
                elif variable in ("salinity", "salinity_psu", "so", "sal"):
                    val = phy.get("salinity_psu")
                elif variable in ("current_u", "u_current", "uo"):
                    val = phy.get("current_u_ms")
                elif variable in ("current_v", "v_current", "vo"):
                    val = phy.get("current_v_ms")
                elif variable in ("current_speed", "speed"):
                    val = phy.get("current_speed_ms")
                elif variable in ("chlorophyll", "chlorophyll_mgl", "chl"):
                    val = bgc.get("chlorophyll_mgl")
                elif variable in ("oxygen", "dissolved_oxygen", "o2"):
                    val = bgc.get("oxygen_mmolm3")
                elif variable in ("nitrate", "no3"):
                    val = bgc.get("nitrate_mmolm3")
                elif variable in ("ph",):
                    val = bgc.get("ph")
                else:
                    val = phy.get("temperature_c")

                matrix_out[d_idx].append(val)
        return stations_out, matrix_out

    loop = asyncio.get_event_loop()
    stations, matrix = await loop.run_in_executor(None, _compute_profile)

    result = {
        "status": "ok",
        "date": date_str,
        "actual_date": date_str,
        "source": "copernicus_zarr",
        "variable": variable,
        "transect": {
            "start": {"lat": lat1, "lon": lon1},
            "end":   {"lat": lat2, "lon": lon2},
            "total_distance_km": round(total_dist, 2),
            "n_stations": samples,
        },
        "depths_m": depths,
        "stations": stations,
        "matrix": matrix,
        "dataset_info": route_info(date_str),
    }
    l1_set(cache_key, result)
    return {**result, "cache": "COMPUTED", "elapsed_ms": round((time.perf_counter() - t0) * 1000, 2)}


# ==============================================================================
# /ocean/volume — multi-depth slices for 3D isosurface rendering
# ==============================================================================

@app.get("/ocean/volume")
async def ocean_volume(
    lat_min: float = Query(...),
    lat_max: float = Query(...),
    lon_min: float = Query(...),
    lon_max: float = Query(...),
    depths: str = Query("0,10,50,100,200,500,1000", description="Comma-separated depths in metres"),
    date: Optional[str] = Query(None, description="ISO date YYYY-MM-DD"),
    variable: str = Query("temperature", description="Primary scalar for volume"),
):
    """
    Lightweight 3D volume grid slices across multiple depths.
    Returns array of depth slices: each slice contains regular grid points with (lat, lon, value).
    Powers 3D isosurface and volumetric rendering in Three.js/Cesium.
    """
    _validate_spatial_bounds(lat_min, lat_max, lon_min, lon_max)
    t0 = time.perf_counter()
    date_str = resolve_date_input(date)

    depth_list = []
    for d_s in depths.split(","):
        try:
            val = float(d_s.strip())
            if 0.0 <= val <= 6000.0:
                depth_list.append(val)
        except ValueError:
            continue
    if not depth_list:
        depth_list = [0.0, 10.0, 50.0, 100.0, 200.0]

    cache_key = f"vol:{lat_min:.2f}:{lat_max:.2f}:{lon_min:.2f}:{lon_max:.2f}:{','.join(str(d) for d in depth_list)}:{date_str}:{variable}"
    cached = l1_get(cache_key)
    if cached:
        return {**cached, "cache": "L1_RAM", "elapsed_ms": round((time.perf_counter() - t0) * 1000, 2)}

    slices = []
    # Centre lat/lon bucket for page table lookups
    centre_lat = (lat_min + lat_max) / 2.0
    centre_lon = (lon_min + lon_max) / 2.0
    centre_lat_b = int(math.floor(centre_lat / LAT_BIN_DEG))
    centre_lon_b = int(math.floor(centre_lon / LON_BIN_DEG))

    for d in depth_list:
        # Query page table for real layer state (resident / on_disk / fetching / not_fetched)
        depth_b = int(math.floor(d / DEPTH_BIN_M))
        layer_state_val = page_table.get_page_state(
            centre_lat_b, centre_lon_b, depth_b, date_str
        ).value.lower()

        loop = asyncio.get_event_loop()
        grid, actual_depth, actual_date, is_ref = await loop.run_in_executor(
            None,
            lambda _d=d: _read_phy_grid(lat_min, lat_max, lon_min, lon_max, _d, date_str, exact_date=True),
        )
        if not grid:
            # Try nearest reference slice before falling back to placeholder
            grid, actual_depth, actual_date, is_ref = await loop.run_in_executor(
                None,
                lambda _d=d: _read_phy_grid(lat_min, lat_max, lon_min, lon_max, _d, date_str, exact_date=False),
            )
            if not grid:
                grid = _get_placeholder_grid(lat_min, lat_max, lon_min, lon_max, d, date_str, step=1.0)
                is_ref = True

        pts = []
        for r in grid:
            val = None
            if variable in ("temperature", "temperature_c", "thetao", "temp"):
                val = r.get("temperature_c")
            elif variable in ("salinity", "salinity_psu", "so", "sal"):
                val = r.get("salinity_psu")
            elif variable in ("current_speed", "speed"):
                val = r.get("current_speed_ms")
            elif variable in ("chlorophyll", "chl"):
                val = r.get("chlorophyll_mgl")
            else:
                val = r.get("temperature_c")

            pts.append({
                "lat": r["lat"],
                "lon": r["lon"],
                "value": val,
                "current_u_ms": r.get("current_u_ms"),
                "current_v_ms": r.get("current_v_ms"),
            })

        slice_source = "copernicus_zarr" if (not is_ref and actual_depth is not None) else (
            "copernicus_zarr_reference" if actual_date else "synthetic_placeholder"
        )
        slices.append({
            "depth_m": d,
            "requested_depth_m": d,
            "actual_depth_m": actual_depth if actual_depth is not None else d,
            "layer_state": layer_state_val,
            "is_reference_slice": is_ref,
            "reference_date": actual_date if is_ref else None,
            "actual_date": actual_date or date_str,
            "source": slice_source,
            "n_points": len(pts),
            "points": pts,
        })

    # Fetch Argo float bounding-box markers for 3D overlay (same as /ocean/snapshot)
    floats = await _get_bbox_floats(lat_min, lat_max, lon_min, lon_max, date_str)
    enriched_floats = _enrich_floats_for_3d(floats, lat_min, lat_max, lon_min, lon_max)

    vol_source = "copernicus_zarr" if any(not s.get("is_reference_slice") for s in slices) else (
        "copernicus_zarr_reference" if any(s.get("reference_date") for s in slices) else "synthetic_placeholder"
    )
    result = {
        "status": "ok",
        "bbox": {"lat_min": lat_min, "lat_max": lat_max, "lon_min": lon_min, "lon_max": lon_max},
        "date": date_str,
        "actual_date": date_str,
        "source": vol_source,
        "variable": variable,
        "n_depth_slices": len(slices),
        "depth_slices": slices,
        "floats": enriched_floats,
        "dataset_info": route_info(date_str),
    }
    l1_set(cache_key, result)
    return {**result, "cache": "COMPUTED", "elapsed_ms": round((time.perf_counter() - t0) * 1000, 2)}


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
# /argo/floats/active — active float discovery by bounding box
# ==============================================================================

@app.get("/argo/floats/active")
async def argo_floats_active(
    lat_min: float = Query(8.0, ge=-90, le=90),
    lat_max: float = Query(22.0, ge=-90, le=90),
    lon_min: float = Query(68.0, ge=-180, le=180),
    lon_max: float = Query(92.0, ge=-180, le=180),
    days: int = Query(45, ge=1, le=180),
    type: str = Query("both", enum=["core", "bgc", "both"]),
):
    """
    Query active Argo floats within bounding box.
    Returns lightweight float markers: platform ID, lat, lon, last_date, type, available variables.
    """
    t0 = time.perf_counter()
    res = await _argo.fetch_active_floats(lat_min, lat_max, lon_min, lon_max, days=days, float_type=type)
    return {**res, "elapsed_ms": round((time.perf_counter() - t0) * 1000, 2)}


# ==============================================================================
# /argo/trajectory — historical float surfacing track
# ==============================================================================

@app.get("/argo/trajectory")
async def argo_trajectory(
    platform_number: str = Query(..., description="Argo platform number (e.g. 2902088)"),
):
    """
    Fetch trajectory (history of positions and surfacing dates) for an Argo platform.
    """
    t0 = time.perf_counter()
    traj_key = f"argo_traj:{platform_number.strip()}"
    cached = l1_get(traj_key)
    if cached:
        return {**cached, "cache": "L1_RAM", "elapsed_ms": round((time.perf_counter() - t0) * 1000, 2)}

    res = await _argo.fetch_argo_trajectory(platform_number.strip())
    if res.get("status") == "success":
        l1_set(traj_key, res)
    return {**res, "elapsed_ms": round((time.perf_counter() - t0) * 1000, 2)}


# ==============================================================================
# /glider/nearest — underwater glider discovery
# ==============================================================================

@app.get("/glider/nearest")
async def glider_nearest(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    radius_km: float = Query(500.0, ge=10, le=3000),
    date_start: Optional[str] = Query(None),
    date_end: Optional[str] = Query(None),
):
    """
    Discover active/archived underwater gliders near (lat, lon) from IOOS Glider DAC and AODN ERDDAP.
    """
    t0 = time.perf_counter()
    gliders = await _glider.search_glider_nearest(lat, lon, radius_km=radius_km, date_start=date_start, date_end=date_end)
    return {
        "status": "ok",
        "query": {"lat": lat, "lon": lon, "radius_km": radius_km},
        "n_gliders": len(gliders),
        "gliders": gliders,
        "elapsed_ms": round((time.perf_counter() - t0) * 1000, 2),
    }


# ==============================================================================
# /glider/profile — glider depth profile
# ==============================================================================

@app.get("/glider/profile")
async def glider_profile(
    dataset_id: str = Query(..., description="Glider dataset ID (e.g. ioos_glider_unit_345)"),
    server: Optional[str] = Query(None, description="ERDDAP server name or URL ('ioos', 'aodn', or full URL)"),
):
    """
    Fetch depth profile for a glider mission including physical and BGC variables.
    """
    t0 = time.perf_counter()
    prof_key = f"glider_prof:{dataset_id}:{server or 'default'}"
    cached = l1_get(prof_key)
    if cached:
        return {**cached, "cache": "L1_RAM", "elapsed_ms": round((time.perf_counter() - t0) * 1000, 2)}

    res = await _glider.fetch_glider_profile(dataset_id=dataset_id, server=server)
    if res.get("status") == "success":
        l1_set(prof_key, res)
    return {**res, "elapsed_ms": round((time.perf_counter() - t0) * 1000, 2)}


# ==============================================================================
# /glider/trajectory — glider mission trajectory
# ==============================================================================

@app.get("/glider/trajectory")
async def glider_trajectory(
    dataset_id: str = Query(..., description="Glider dataset ID"),
    server: Optional[str] = Query(None),
):
    """
    Fetch spatial-temporal trajectory of an underwater glider mission.
    """
    t0 = time.perf_counter()
    traj_key = f"glider_traj:{dataset_id}:{server or 'default'}"
    cached = l1_get(traj_key)
    if cached:
        return {**cached, "cache": "L1_RAM", "elapsed_ms": round((time.perf_counter() - t0) * 1000, 2)}

    res = await _glider.fetch_glider_trajectory(dataset_id=dataset_id, server=server)
    if res.get("status") == "success":
        l1_set(traj_key, res)
    return {**res, "elapsed_ms": round((time.perf_counter() - t0) * 1000, 2)}


# ==============================================================================
# /ctd/moorings — AODN/IMOS CTD mooring stations
# ==============================================================================

@app.get("/ctd/moorings")
def ctd_moorings():
    """
    List available AODN/IMOS CTD mooring stations with geographical positions and variable metadata.
    """
    stations = _glider.scan_mooring_stations(AODN_DIR)
    return {
        "status": "ok",
        "n_stations": len(stations),
        "stations": stations,
    }


# ==============================================================================
# /ctd/timeseries — CTD mooring time-series
# ==============================================================================

@app.get("/ctd/timeseries")
def ctd_timeseries(
    station_id: str = Query(..., description="Station identifier (e.g. NRSROT)"),
    date_start: Optional[str] = Query(None),
    date_end: Optional[str] = Query(None),
    limit: int = Query(500, ge=10, le=2000),
):
    """
    Fetch CTD mooring time-series at standard depths from local AODN records.
    """
    return _glider.get_mooring_timeseries(
        station_id=station_id,
        date_start=date_start,
        date_end=date_end,
        aodn_dir=AODN_DIR,
        max_points=limit,
    )


# ==============================================================================
# /observation/active — Common Observation Model unified marker query
# ==============================================================================

@app.get("/observation/active")
async def observation_active(
    lat_min: float = Query(8.0, ge=-90, le=90),
    lat_max: float = Query(22.0, ge=-90, le=90),
    lon_min: float = Query(68.0, ge=-180, le=180),
    lon_max: float = Query(92.0, ge=-180, le=180),
    date_start: Optional[str] = Query(None),
    date_end: Optional[str] = Query(None),
    sources: Optional[str] = Query("argo,glider,ctd", description="Comma-separated sources: argo, glider, ctd"),
    max_results: int = Query(150, ge=1, le=500),
):
    """
    Unified Common Observation Model query: returns standardized observation markers
    for all platforms (Core Argo, BGC-Argo, Gliders, CTD Moorings) in the requested area.
    """
    t0 = time.perf_counter()
    src_list = [s.strip() for s in sources.split(",") if s.strip()] if sources else None
    markers = await _obs.query_active_observations(
        lat_min=lat_min, lat_max=lat_max,
        lon_min=lon_min, lon_max=lon_max,
        date_start=date_start, date_end=date_end,
        sources=src_list, max_results=max_results,
    )
    return {
        "status": "ok",
        "bbox": {"lat_min": lat_min, "lat_max": lat_max, "lon_min": lon_min, "lon_max": lon_max},
        "count": len(markers),
        "observations": markers,
        "elapsed_ms": round((time.perf_counter() - t0) * 1000, 2),
    }


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
# /ocean/prewarm_status  — debug: show which home tiles are warm
# ==============================================================================

@app.get("/ocean/prewarm_status")
def ocean_prewarm_status():
    """Return the pre-warm status for each home-region tile."""
    tiles = []
    for label, lat_min, lat_max, lon_min, lon_max in PREWARM_REGIONS:
        status = _prewarm_status.get(label, "not_started")
        # Check if page is actually pinned in page table
        import math as _math
        lat_b = int(_math.floor(lat_min / LAT_BIN_DEG))
        lon_b = int(_math.floor(lon_min / LON_BIN_DEG))
        pid = f"{lat_b}:{lon_b}:0:{yesterday_iso()}"
        pg = page_table._pages.get(pid)
        pinned = pg.pinned if pg else False
        page_state = pg.state.value if pg else "UNKNOWN"
        tiles.append({
            "label": label,
            "bbox": {"lat_min": lat_min, "lat_max": lat_max,
                     "lon_min": lon_min, "lon_max": lon_max},
            "prewarm_phase": status,
            "pinned": pinned,
            "page_state": page_state,
        })
    return {
        "status": "ok",
        "total_tiles": len(PREWARM_REGIONS),
        "synthetic_ready": sum(1 for t in tiles if t["prewarm_phase"] == "synthetic"),
        "real_ready":      sum(1 for t in tiles if t["prewarm_phase"] == "real"),
        "tiles": tiles,
    }


# ==============================================================================
# /backend/status — Comprehensive backend telemetry for monitoring and debugging
# ==============================================================================

@app.get("/backend/status")
def backend_status():
    """
    Comprehensive backend telemetry for monitoring and debugging.
    Returns: zarr store presence + sizes, page table stats, cache stats,
    active fetches, pre-warm phase, credentials status, latest available date.
    """
    from datetime import datetime as _dt

    def _zarr_info(path: Path) -> dict:
        if not path.exists():
            return {"present": False, "size_bytes": 0, "size_mb": 0.0}
        size = sum(f.stat().st_size for f in path.rglob("*") if f.is_file())
        return {"present": True, "size_bytes": size, "size_mb": round(size / 1024 / 1024, 2)}

    pt_stats = page_table.stats()

    prewarm_summary = {
        "synthetic": sum(1 for v in _prewarm_status.values() if v == "synthetic"),
        "real": sum(1 for v in _prewarm_status.values() if v == "real"),
        "total_tiles": len(PREWARM_REGIONS),
        "details": _prewarm_status,
    }

    return {
        "status": "ok",
        "server_time_utc": _dt.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "latest_available_date": latest_available_iso(),
        "credentials_present": _fetcher.credentials_present(),
        "zarr_stores": {
            "phy": _zarr_info(PHY_ZARR_PATH),
            "bgc": _zarr_info(BGC_ZARR_PATH),
            "ocean_legacy": _zarr_info(OCEAN_ZARR_PATH),
            "argo": _zarr_info(ARGO_ZARR_PATH),
        },
        "zarr_loaded": {
            "phy": phy_dataset_xr is not None,
            "bgc": bgc_dataset_xr is not None,
            "ocean_legacy": ocean_dataset_xr is not None,
            "argo": argo_dataset_xr is not None,
        },
        "page_table": pt_stats,
        "cache": {
            **cache_stats,
            "l1_entries": len(_l1),
            "l1_ttl_seconds": L1_TTL_SECONDS,
            "l1_hit_rate_pct": round(cache_stats["l1_hits"] / max(1, cache_stats["total_requests"]) * 100, 1),
            "l2_hit_rate_pct": round(cache_stats["l2_hits"] / max(1, cache_stats["total_requests"]) * 100, 1),
        },
        "active_fetches": len(_fetch_tasks),
        "active_fetch_keys": list(_fetch_tasks.keys())[:20],
        "websocket_connections": len(_ws_manager._connections),
        "prewarm": prewarm_summary,
        "config": {
            "zarr_cap_bytes": ZARR_CAP_BYTES,
            "zarr_cap_gb": round(ZARR_CAP_BYTES / 1024 ** 3, 1),
            "l1_ttl_seconds": L1_TTL_SECONDS,
            "depth_bin_m": DEPTH_BIN_M,
            "lat_bin_deg": LAT_BIN_DEG,
            "lon_bin_deg": LON_BIN_DEG,
        },
    }


# ==============================================================================
# /ocean/evict — Manually trigger LRU eviction of ON_DISK pages
# ==============================================================================

@app.post("/ocean/evict")
def ocean_evict(
    target_free_gb: float = Query(0.5, ge=0.01, le=10.0, description="Target gigabytes to free"),
):
    """
    Manually trigger LRU eviction of ON_DISK pages from the page table.
    Does NOT delete zarr data from disk — only removes page table entries
    for non-pinned pages to free tracking overhead and allow re-fetch.
    Returns: list of evicted page IDs.
    """
    target_bytes = int(target_free_gb * 1024 ** 3)
    evicted = page_table.evict_lru(target_free_bytes=target_bytes)
    return {
        "status": "ok",
        "target_free_gb": target_free_gb,
        "target_free_bytes": target_bytes,
        "evicted_count": len(evicted),
        "evicted_page_ids": evicted[:100],
        "page_table_after": page_table.stats(),
    }


# ==============================================================================
# /ocean/cache — Flush L1 cache and/or non-pinned page table entries
# ==============================================================================

@app.delete("/ocean/cache")
def ocean_cache_delete(
    scope: str = Query("l1", enum=["l1", "page_table", "all"], description="What to clear"),
):
    """
    Delete cached data.
    scope=l1          → flush the L1 in-memory cache only
    scope=page_table  → remove all non-pinned page-table entries
    scope=all         → both L1 and non-pinned page table entries
    """
    result = {"status": "ok", "scope": scope}
    if scope in ("l1", "all"):
        n_l1 = l1_clear()
        result["l1_cleared"] = n_l1
    if scope in ("page_table", "all"):
        n_pt = page_table.clear_non_pinned()
        result["page_table_entries_cleared"] = n_pt
    result["page_table_after"] = page_table.stats()
    return result


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
        # No zarr loaded yet — return structural info from known config
        return {
            "status": "no_zarr",
            "note": "No zarr store loaded yet. Data will be available after first Copernicus fetch.",
            "dimensions": {},
            "variables": [],
            "lat_range": [BBOX["min_lat"], BBOX["max_lat"]],
            "lon_range": [BBOX["min_lon"], BBOX["max_lon"]],
            "depths": list(range(0, 201, 5)),
            "time_range": [],
            "locations": LOCATIONS,
            "source": "config_fallback",
        }
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
        "source": "zarr_real",
    }


@app.get("/api/coastal-temps")
def api_coastal_temps(variable: str = "thetao", date: Optional[str] = Query(None)):
    t0 = time.perf_counter()
    date_str = resolve_date_input(date)
    ds = phy_dataset_xr or ocean_dataset_xr

    if ds is None:
        # Synthesize time-series for known stations from the analytical model
        results, details = {}, {}
        for loc_key, loc in LOCATIONS.items():
            series = []
            for d in range(7):  # 7-day synthetic series
                import datetime as _dtt
                day_str = (_dtt.date.fromisoformat(date_str) - _dtt.timedelta(days=7-d)).isoformat()
                phy = _synthesize_phy_point(loc["lat"], loc["lon"], depth=0.0)
                series.append({"date": day_str, "value": phy.get("temperature_c")})
            results[loc_key] = series
            details[loc_key] = {"location": loc["name"], "lat": loc["lat"],
                                 "lon": loc["lon"], "cache_layer": "synthetic"}
        return {
            "status": "success", "variable": variable, "unit": "°C", "date": date_str,
            "total_elapsed_ms": round((time.perf_counter() - t0) * 1000, 3),
            "source": "synthetic_no_zarr",
            "note": "No zarr store loaded; values from analytical ocean model.",
            "stations": details, "data": results,
        }

    results, details = {}, {}
    for loc_key, loc in LOCATIONS.items():
        key = f"series:{loc_key}:{variable}:{date_str}"
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
        "status": "success", "variable": variable, "unit": "°C", "date": date_str,
        "total_elapsed_ms": round((time.perf_counter() - t0) * 1000, 3),
        "stations": details, "data": results,
    }


@app.get("/api/depth-profile")
def api_depth_profile(
    location: Optional[str] = "chennai",
    variable: str = "thetao",
    lat: Optional[float] = Query(None, ge=-90, le=90),
    lon: Optional[float] = Query(None, ge=-180, le=180),
    date: Optional[str] = Query(None),
):
    ds = phy_dataset_xr or ocean_dataset_xr
    date_str = resolve_date_input(date)

    if lat is not None and lon is not None:
        loc_name = f"Point ({lat:.2f}, {lon:.2f})"
        loc_lat, loc_lon = lat, lon
        loc_id = f"{lat:.2f}_{lon:.2f}"
    elif location and location.lower() in LOCATIONS:
        loc = LOCATIONS[location.lower()]
        loc_name = loc["name"]
        loc_lat, loc_lon = loc["lat"], loc["lon"]
        loc_id = location.lower()
    else:
        return {"status": "not_found", "message": f"Location {location!r} not in known stations and no lat/lon given", "profile": []}

    key = f"depth:{loc_id}:{variable}:{date_str}"
    cached = l1_get(key)
    if cached:
        return {"location": loc_name, "cache": "L1_RAM", "date": date_str, "profile": cached}

    if ds is None or "depth" not in ds.coords:
        # Synthesize a depth profile from the analytical model
        profile = []
        for d in [0, 5, 10, 20, 30, 50, 75, 100, 150, 200, 500, 1000]:
            phy = _synthesize_phy_point(loc_lat, loc_lon, depth=float(d))
            profile.append({
                "depth_m": float(d),
                "requested_depth_m": float(d),
                "actual_depth_m": float(d),
                "value": phy.get("temperature_c"),
                **phy,
            })
        l1_set(key, profile)
        return {
            "location": loc_name, "cache": "synthetic", "date": date_str,
            "source": "synthetic_no_zarr",
            "note": "Values from analytical ocean model.",
            "profile": profile,
        }

    try:
        pt = _select_point(ds, loc_lat, loc_lon)
        if "time" in pt.dims:
            pt = pt.sel(time=np.datetime64(date_str), method="nearest")

        depths = pt["depth"].values
        v_target = variable
        if v_target not in pt:
            alias_map = {"temperature": "thetao", "temp": "thetao", "salinity": "so", "u": "uo", "v": "vo"}
            v_target = alias_map.get(v_target, list(pt.data_vars)[0] if pt.data_vars else "thetao")

        if v_target in pt:
            vals = pt[v_target].values
            profile = []
            for i, d in enumerate(depths):
                v_val = vals[i] if hasattr(vals, '__len__') and i < len(vals) else vals
                d_f = round(float(d), 2)
                profile.append({
                    "depth_m": d_f,
                    "requested_depth_m": d_f,
                    "actual_depth_m": d_f,
                    "value": _safe_float(v_val),
                })
        else:
            profile = []
        l1_set(key, profile)
        return {"location": loc_name, "cache": "L2_ZARR", "date": date_str, "profile": profile}
    except Exception as e:
        return {"location": loc_name, "cache": "error", "error": str(e), "profile": []}


@app.get("/api/argo-floats")
def api_argo_floats(limit: int = Query(200, ge=1, le=5000)):
    ds = argo_dataset_xr
    if ds is None:
        return {
            "status": "no_zarr",
            "note": "Argo zarr not loaded yet — use /argo/nearest for live fetch.",
            "total_in_store": 0, "returned": 0, "floats": [],
            "source": "no_zarr",
        }
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
        return {
            "status": "no_zarr",
            "note": "Argo zarr not loaded yet — use /argo/profile for live fetch.",
            "platforms": [], "source": "no_zarr",
        }
    if "PLATFORM_NUMBER" not in ds:
        return {"status": "no_platform_data", "platforms": []}
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
    date_start: str = Query(None, description="ISO date YYYY-MM-DD (default: start of argo store)"),
    date_end:   str = Query(None, description="ISO date YYYY-MM-DD (default: end of argo store)"),
):
    ds = argo_dataset_xr
    if ds is None:
        return {
            "status": "no_zarr",
            "note": "Argo zarr not loaded yet.",
            "date_start": date_start, "date_end": date_end,
            "count": 0, "floats": [], "source": "no_zarr",
        }

    times = ds["TIME"].values
    t_min_str = str(times.min())[:10]
    t_max_str = str(times.max())[:10]

    resolved_start = resolve_date_input(date_start) if date_start else t_min_str
    resolved_end = resolve_date_input(date_end) if date_end else t_max_str

    t0 = np.datetime64(resolved_start)
    t1 = np.datetime64(resolved_end)
    mask = (times >= t0) & (times <= t1)
    
    # If the requested date window yields 0 points (e.g. out-of-range date requested), fallback to all available
    if not np.any(mask):
        mask = np.ones(len(times), dtype=bool)
        resolved_start = t_min_str
        resolved_end = t_max_str

    lats  = ds["LATITUDE"].values
    lons  = ds["LONGITUDE"].values
    plats = ds["PLATFORM_NUMBER"].values if "PLATFORM_NUMBER" in ds else []
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
        # Return synthesized overview from analytical model
        synth_grid = _get_placeholder_grid(
            BBOX["min_lat"], BBOX["max_lat"],
            BBOX["min_lon"], BBOX["max_lon"],
            depth=0.0, date_str=yesterday_iso(), step=2.0,
        )
        temps = [r["temperature_c"] for r in synth_grid if r.get("temperature_c") is not None]
        overview = {
            "status": "ok",
            "variable": "temperature_c",
            "source": "synthetic_no_zarr",
            "note": "No zarr loaded; values from analytical ocean model.",
            "bbox": BBOX,
            "min":  round(min(temps), 3) if temps else None,
            "max":  round(max(temps), 3) if temps else None,
            "mean": round(sum(temps) / len(temps), 3) if temps else None,
            "grid_shape": [len(synth_grid)],
        }
        l1_set("overview", overview)
        return {**overview, "cache": "synthetic"}
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
                    # _read_phy_grid returns (rows, actual_depth, actual_date, is_ref)
                    # Must unpack all 4 — iterating the tuple directly is wrong.
                    loop = asyncio.get_event_loop()
                    _result = await loop.run_in_executor(
                        None,
                        lambda d=d_mid: _read_phy_grid(
                            lat_min, lat_max, lon_min, lon_max, d, date_str,
                            exact_date=False,
                        ),
                    )
                    grid_rows, _ad, _adate, _is_ref = _result

                    pts = [
                        {
                            "lat": r["lat"],
                            "lon": r["lon"],
                            "value": r.get("temperature_c"),
                            "date": _adate,
                            "is_reference": _is_ref,
                        }
                        for r in grid_rows
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
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        # Exclude data directories and binary data files from watchfiles.
        # Without this, every Zarr/NC write inside backend/output/ triggers
        # a full server reload loop that kills in-flight Copernicus fetches.
        reload_excludes=[
            str(BASE_DIR / "output"),
            "*.zarr",
            "*.nc",
            "*.nc.tmp",
            "*.zarr.tmp",
        ],
        reload_dirs=[str(BASE_DIR)],
    )
