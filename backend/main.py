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

# ==============================================================================
# ── CENTRALISED CONFIG BLOCK ──────────────────────────────────────────────────
# All tuneable paths and constants live here at the top.
# ==============================================================================
BASE_DIR       = Path(__file__).resolve().parent
OUTPUT_DIR     = BASE_DIR / "output"
PHY_ZARR_PATH  = OUTPUT_DIR / "phy_data.zarr"
BGC_ZARR_PATH  = OUTPUT_DIR / "bgc_data.zarr"
OCEAN_ZARR_PATH = OUTPUT_DIR / "ocean_data.zarr"   # legacy compat
ARGO_ZARR_PATH  = OUTPUT_DIR / "argo_data.zarr"
# Copernicus static bathymetry (deptho) — written by fetcher.fetch_bathy_range()
BATHY_ZARR_PATH = OUTPUT_DIR / "bathy_data.zarr"
# Full-depth demo dataset and bathymetry (from download_full_depth.py)
DEMO_FULL_DEPTH_PATH = OUTPUT_DIR / "demo_full_depth.zarr"
DEMO_BATHYMETRY_PATH = OUTPUT_DIR / "demo_bathymetry.zarr"
# Backup snapshot (written by create_backup.py, served when live zarr absent)
BACKUP_PHY_ZARR_PATH = OUTPUT_DIR / "backup_phy.zarr"
BACKUP_BGC_ZARR_PATH = OUTPUT_DIR / "backup_bgc.zarr"
# Full-mode cache dir: pre-merged full-depth tiles (for ?mode=full on /ocean/volume-full)
FULL_CACHE_DIR = OUTPUT_DIR / "full_cache"

ROOT_DIR       = BASE_DIR.parent
AODN_DIR       = ROOT_DIR / "aodn_output"

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
    MAX_OCEAN_DEPTH_M, BATHY_DATASET, BATHY_VARIABLE,
)
import ai_inference as _ai

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")
logger = logging.getLogger("main")


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

# ---------------------------------------------------------------------------
# Copernicus minimum depth — the shallowest level in the ANFC/MY datasets
# is approximately 0.494 m. Sending depth=0.0 to the subset() API causes
# a "no data at coordinate" error. Always clamp to COPERNICUS_MIN_DEPTH.
# ---------------------------------------------------------------------------
COPERNICUS_MIN_DEPTH: float = 0.494025

def _clamp_depth_min(d: float) -> float:
    """Ensure depth is at or above the Copernicus dataset's shallowest level."""
    return max(COPERNICUS_MIN_DEPTH, float(d))

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
# Copernicus static bathymetry dataset (deptho from bathy_data.zarr)
bathy_dataset_xr:   Optional[xr.Dataset] = None
# 50-level full depth and bathymetry datasets
demo_full_depth_xr: Optional[xr.Dataset] = None
demo_bathymetry_xr: Optional[xr.Dataset] = None
# Backup Zarr datasets (from create_backup.py) — served when live zarr is unavailable
backup_phy_dataset_xr: Optional[xr.Dataset] = None
backup_bgc_dataset_xr: Optional[xr.Dataset] = None
# Metadata extracted from backup zarr attrs
backup_date: Optional[str] = None   # actual snapshot date stored in backup

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
# Pre-warm regions — GLOBAL 5-ocean representative pinned tiles.
#
# Each tuple: (label, lat_min, lat_max, lon_min, lon_max)
#
# PINNED TILES (never evicted):
#   One representative 4°x4° tile per major ocean guarantees a minimal
#   cached representation is always present after startup, even before
#   the user visits those oceans.  These are synthetic-warm at first and
#   upgrade to real Copernicus data when credentials are present.
#
# INDIAN OCEAN tiles are retained for the home region demo.
# ==============================================================================
PREWARM_REGIONS = [
    # ── 1. Indian Ocean ──────────────────────────────────────────────────────
    ("indian_ocean",           -10.0, -6.0,  70.0,  78.0),
    # ── 2. Pacific Ocean ─────────────────────────────────────────────────────
    ("pacific_ocean",            0.0,  4.0, 160.0, 168.0),
    # ── 3. Atlantic Ocean ────────────────────────────────────────────────────
    ("atlantic_ocean",          25.0, 29.0, -45.0, -37.0),
    # ── 4. Arctic Ocean ──────────────────────────────────────────────────────
    ("arctic_ocean",            74.0, 78.0,   0.0,   8.0),
    # ── 5. Southern Ocean ────────────────────────────────────────────────────
    ("southern_ocean",         -60.0,-56.0,  55.0,  63.0),
]

# Regions that must never be evicted — exactly the 5 major oceans.
GLOBAL_PINNED_OCEAN_LABELS = {
    "indian_ocean",
    "pacific_ocean",
    "atlantic_ocean",
    "arctic_ocean",
    "southern_ocean",
}



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
# Thread-safe zarr reload lock — prevents concurrent reloads from racing
import threading
_zarr_reload_lock = threading.Lock()

_logged_errors = set()
def _log_read_error_once(err_type: str, msg: str):
    if err_type not in _logged_errors:
        _logged_errors.add(err_type)
        logger.warning(f"[{err_type}] {msg}")


def _physical_bathymetry_relief(lat: float, lon: float) -> float:
    """Compute physical seafloor depth in metres (0m to ~6000m) based on major ridges and trenches."""
    l = float(lon)
    la = float(lat)
    base_depth = 3800.0

    # 1. Deep Trenches
    trench_drop = 0.0
    # Java / Sunda Trench (~ -10S, 105E)
    d_java = math.hypot(la - (-10.2), l - 105.0)
    if d_java < 14.0:
        trench_drop += (1.0 - d_java / 14.0) * 2800.0
    # Mariana Trench (~11N, 142E)
    d_mariana = math.hypot(la - 11.3, l - 142.2)
    if d_mariana < 12.0:
        trench_drop += (1.0 - d_mariana / 12.0) * 3500.0
    # Puerto Rico Trench (~19.5N, -66W)
    d_pr = math.hypot(la - 19.5, l - (-66.0))
    if d_pr < 10.0:
        trench_drop += (1.0 - d_pr / 10.0) * 2500.0
    # South Sandwich Trench (~-55S, -26W)
    d_ss = math.hypot(la - (-55.0), l - (-26.0))
    if d_ss < 12.0:
        trench_drop += (1.0 - d_ss / 12.0) * 2600.0

    # 2. Mid-Ocean Ridges (uplift seafloor towards 1800-2400m)
    ridge_uplift = 0.0
    # Mid-Atlantic Ridge
    if -55 <= la <= 65 and -52 <= l <= -15:
        spine = -35.0 + math.sin(la * 0.09) * 7.0
        dist = abs(l - spine)
        if dist < 9.0:
            ridge_uplift += (1.0 - dist / 9.0) * 1650.0
    # Central Indian Ridge & Ninety East Ridge
    if -45 <= la <= 15 and 55 <= l <= 96:
        cir = 68.0 + math.sin(la * 0.12) * 6.0
        d_cir = abs(l - cir)
        d_ner = abs(l - 90.0)
        d_min = min(d_cir, d_ner)
        if d_min < 8.0:
            ridge_uplift += (1.0 - d_min / 8.0) * 1550.0
    # East Pacific Rise
    if -60 <= la <= 25 and -140 <= l <= -90:
        epr = -112.0 + math.sin(la * 0.08) * 9.0
        d_epr = abs(l - epr)
        if d_epr < 12.0:
            ridge_uplift += (1.0 - d_epr / 12.0) * 1500.0

    # 3. Multi-harmonic abyssal hills & fracture zones
    hills = (
        240.0 * math.sin(la * 0.42 + l * 0.31) +
        160.0 * math.cos(la * 0.85 - l * 0.58) +
        90.0 * math.sin(la * 1.65 + l * 1.35)
    )

    depth = base_depth - ridge_uplift + trench_drop + hills
    return round(max(50.0, min(6500.0, depth)), 2)


def _thin_depth_levels(levels: List[float], target: int = 18) -> List[float]:
    """Thin a depth level list to ~target entries, keeping dense shallow coverage
    and sparse deep coverage. Always includes the shallowest and deepest levels."""
    if len(levels) <= target:
        return [round(float(d), 3) for d in levels]
    result = [levels[0]]
    shallow = [d for d in levels if d <= 200.0]
    deep    = [d for d in levels if d >  200.0]
    n_shallow = min(len(shallow), max(1, target * 2 // 3))
    n_deep    = max(1, target - n_shallow)
    if shallow:
        step_s = max(1, len(shallow) // n_shallow)
        result += [d for d in shallow[step_s::step_s]]
    if deep:
        step_d = max(1, len(deep) // n_deep)
        result += [d for d in deep[::step_d]]
    if levels[-1] not in result:
        result.append(levels[-1])
    seen = set()
    out = []
    for d in sorted(result):
        rd = round(float(d), 3)
        if rd not in seen:
            seen.add(rd)
            out.append(rd)
    return out[:target]


def get_bathymetry(
    bbox: Any,
    lats: Optional[List[float]] = None,
    lons: Optional[List[float]] = None,
    *args,
) -> Tuple[List[List[Optional[float]]], str]:
    """
    Return (bathy_grid[lat][lon], source_label).
    Tiers:
      1. bathy_data.zarr (Copernicus deptho) — if its extent covers the bbox
      2. demo_bathymetry.zarr               — if its extent covers the bbox
      3. analytical relief model

    Coverage = store lat/lon extent vs bbox (NOT NaN counting).
    Inside a covered store: NaN = land (valid null); outside = go to next tier.
    .sel nearest with tolerance 0.2 deg.
    bathymetry_source: "copernicus_deptho" | "demo_bathymetry" | "analytical_relief"
    Never label analytical as real; never infer bathymetry from temperature.
    """
    global bathy_dataset_xr, demo_bathymetry_xr

    if isinstance(bbox, (list, tuple)) and len(bbox) == 4:
        lat_min, lat_max, lon_min, lon_max = [float(x) for x in bbox]
    elif isinstance(bbox, dict):
        lat_min = float(bbox.get("lat_min", bbox.get("min_lat", 0)))
        lat_max = float(bbox.get("lat_max", bbox.get("max_lat", 0)))
        lon_min = float(bbox.get("lon_min", bbox.get("min_lon", 0)))
        lon_max = float(bbox.get("lon_max", bbox.get("max_lon", 0)))
    elif len(args) >= 2:
        lat_min, lat_max, lon_min, lon_max = float(bbox), float(lats), float(lons), float(args[0])
        lats = args[1] if len(args) > 1 else None
        lons = args[2] if len(args) > 2 else None
    else:
        lat_min, lat_max, lon_min, lon_max = 8.0, 22.0, 68.0, 90.0

    if lats is None or len(lats) == 0:
        lats = [round(lat_min + i * (lat_max - lat_min) / 40.0, 3) for i in range(41)]
    if lons is None or len(lons) == 0:
        lons = [round(lon_min + j * (lon_max - lon_min) / 40.0, 3) for j in range(41)]

    # Cap to <= 120x120 for contract budget
    if len(lats) > 120:
        stride_la = max(1, int(math.ceil(len(lats) / 120.0)))
        lats = lats[::stride_la]
    if len(lons) > 120:
        stride_lo = max(1, int(math.ceil(len(lons) / 120.0)))
        lons = lons[::stride_lo]

    def _store_covers(ds: xr.Dataset) -> bool:
        try:
            lc = _lat_coord(ds)
            lnc = _lon_coord(ds)
            ds_lat_min = float(ds[lc].values.min())
            ds_lat_max = float(ds[lc].values.max())
            ds_lon_min = float(ds[lnc].values.min())
            ds_lon_max = float(ds[lnc].values.max())
            return (ds_lat_min <= lat_min + 0.1 and ds_lat_max >= lat_max - 0.1 and
                    ds_lon_min <= lon_min + 0.1 and ds_lon_max >= lon_max - 0.1)
        except Exception:
            return False

    def _extract_grid(ds: xr.Dataset, var: str) -> Optional[List[List[Optional[float]]]]:
        try:
            lc = _lat_coord(ds)
            lnc = _lon_coord(ds)
            sub = ds[var].sel({lc: lats}, method="nearest", tolerance=0.2).sel({lnc: lons}, method="nearest", tolerance=0.2)
            arr = sub.values
            while arr.ndim > 2:
                arr = arr[0]
            grid = []
            for i in range(len(lats)):
                row = []
                for j in range(len(lons)):
                    if i < arr.shape[0] and j < arr.shape[1]:
                        val = arr[i, j]
                        if np.isfinite(val):
                            row.append(round(abs(float(val)), 2))
                        else:
                            row.append(None)
                    else:
                        row.append(None)
                grid.append(row)
            return grid
        except Exception as e:
            _log_read_error_once("bathy_extract", f"Failed extracting bathymetry grid: {e}")
            return None

    # Tier 1: Copernicus deptho
    if bathy_dataset_xr is None and BATHY_ZARR_PATH.exists():
        bathy_dataset_xr = _safe_open_zarr(BATHY_ZARR_PATH)
    if bathy_dataset_xr is not None and "deptho" in bathy_dataset_xr and _store_covers(bathy_dataset_xr):
        grid = _extract_grid(bathy_dataset_xr, "deptho")
        if grid is not None:
            return grid, "copernicus_deptho"

    # Tier 2: demo_bathymetry
    if demo_bathymetry_xr is None and DEMO_BATHYMETRY_PATH.exists():
        demo_bathymetry_xr = _safe_open_zarr(DEMO_BATHYMETRY_PATH)
    bathy_var = None
    if demo_bathymetry_xr is not None:
        for v in ("seafloor_depth_m", "deptho", "depth"):
            if v in demo_bathymetry_xr:
                bathy_var = v
                break
    if bathy_var and _store_covers(demo_bathymetry_xr):
        grid = _extract_grid(demo_bathymetry_xr, bathy_var)
        if grid is not None:
            return grid, "demo_bathymetry"

    # Tier 3: analytical relief
    grid = [
        [_physical_bathymetry_relief(la, lo) for lo in lons]
        for la in lats
    ]
    return grid, "analytical_relief"


def pick_phy_dataset(
    bbox: Any,
    date: Optional[str] = None,
    need_depth_m: float = 0.0,
    *args,
) -> Tuple[Optional[xr.Dataset], str, bool]:
    """
    Select the best physics dataset for this bbox/date/depth request.
    Order: live phy_data.zarr -> full_cache file covering the request -> demo_full_depth -> backup_phy -> analytical.
    A candidate qualifies only if it overlaps bbox AND reaches min(need_depth_m, native max) within 15%.
    A shallow live store must not beat a deep demo.
    Source labels: copernicus_zarr | full_cache | demo_full_depth | backup_cache | analytical_demo
    """
    global phy_dataset_xr, demo_full_depth_xr, backup_phy_dataset_xr

    if isinstance(bbox, (list, tuple)) and len(bbox) == 4:
        lat_min, lat_max, lon_min, lon_max = [float(x) for x in bbox]
        date_str = str(date) if date else today_iso()
        req_depth = float(need_depth_m)
    elif isinstance(bbox, dict):
        lat_min = float(bbox.get("lat_min", bbox.get("min_lat", 0)))
        lat_max = float(bbox.get("lat_max", bbox.get("max_lat", 0)))
        lon_min = float(bbox.get("lon_min", bbox.get("min_lon", 0)))
        lon_max = float(bbox.get("lon_max", bbox.get("max_lon", 0)))
        date_str = str(date) if date else today_iso()
        req_depth = float(need_depth_m)
    elif len(args) >= 2:
        lat_min, lat_max, lon_min, lon_max = float(bbox), float(date), float(need_depth_m), float(args[0])
        date_str = str(args[1]) if len(args) > 1 else today_iso()
        req_depth = float(args[2]) if len(args) > 2 else 0.0
    else:
        lat_min, lat_max, lon_min, lon_max = 8.0, 22.0, 68.0, 90.0
        date_str = str(date) if date else today_iso()
        req_depth = float(need_depth_m)

    def _overlaps_bbox(ds: xr.Dataset) -> bool:
        try:
            lc = _lat_coord(ds)
            lnc = _lon_coord(ds)
            ds_lat_min = float(ds[lc].values.min())
            ds_lat_max = float(ds[lc].values.max())
            ds_lon_min = float(ds[lnc].values.min())
            ds_lon_max = float(ds[lnc].values.max())
            lat_ok = ds_lat_max >= lat_min and ds_lat_min <= lat_max
            lon_ok = ds_lon_max >= lon_min and ds_lon_min <= lon_max
            return lat_ok and lon_ok
        except Exception:
            return False

    def _native_max_depth(ds: xr.Dataset) -> float:
        try:
            if "depth" in ds.dims:
                return float(ds["depth"].values.max())
        except Exception:
            pass
        return 0.0

    def _qualifies(ds: xr.Dataset) -> bool:
        if not _overlaps_bbox(ds):
            return False
        native_max = _native_max_depth(ds)
        # Target depth: candidate must reach within 15% of need_depth_m
        if req_depth > 50.0:
            target = min(req_depth, MAX_OCEAN_DEPTH_M)
            return native_max >= target * 0.85
        return True

    # Tier 1: live zarr
    if phy_dataset_xr is not None and _qualifies(phy_dataset_xr):
        return phy_dataset_xr, "copernicus_zarr", False

    # Tier 2: full_cache files covering the request
    if FULL_CACHE_DIR.exists():
        for fc in sorted(FULL_CACHE_DIR.glob("*.zarr")):
            try:
                ds_fc = _safe_open_zarr(fc)
                if ds_fc is not None and _qualifies(ds_fc):
                    if "time" in ds_fc.coords:
                        t_min = str(ds_fc["time"].values.min())[:10]
                        t_max = str(ds_fc["time"].values.max())[:10]
                        if t_min <= date_str <= t_max:
                            return ds_fc, "full_cache", False
                    else:
                        return ds_fc, "full_cache", False
            except Exception:
                pass

    # Tier 3: demo_full_depth
    if demo_full_depth_xr is None and DEMO_FULL_DEPTH_PATH.exists():
        demo_full_depth_xr = _safe_open_zarr(DEMO_FULL_DEPTH_PATH)
    if demo_full_depth_xr is not None and _qualifies(demo_full_depth_xr):
        return demo_full_depth_xr, "demo_full_depth", True

    # Tier 4: backup_phy
    if backup_phy_dataset_xr is None and BACKUP_PHY_ZARR_PATH.exists():
        backup_phy_dataset_xr = _safe_open_zarr(BACKUP_PHY_ZARR_PATH)
    if backup_phy_dataset_xr is not None and _qualifies(backup_phy_dataset_xr):
        return backup_phy_dataset_xr, "backup_cache", True

    return None, "analytical_demo", True



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
    global backup_phy_dataset_xr, backup_bgc_dataset_xr, backup_date
    global demo_full_depth_xr, demo_bathymetry_xr, bathy_dataset_xr
    logger.info("=" * 60)
    logger.info("Initialising L2 storage layer (Zarr)")

    # Ensure output directories exist
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    FULL_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    logger.info(f"[STARTUP] FULL_CACHE_DIR: {FULL_CACHE_DIR}")

    # Log credential status at startup so the operator knows immediately
    # whether live Copernicus fetches (phy/bgc/bathy) will work.
    cred_ok = _fetcher.credentials_present()
    logger.info(
        f"[STARTUP] credentials_present()={'TRUE — live Copernicus fetches enabled' if cred_ok else 'FALSE — all Copernicus fetches will be SKIPPED (phy/bgc/bathy)'}"
    )

    for path, attr_name, label in [
        (DEMO_FULL_DEPTH_PATH, "demo_full_depth_xr", "Demo Full Depth (50 layers)"),
        (DEMO_BATHYMETRY_PATH, "demo_bathymetry_xr", "Demo Bathymetry"),
        (BATHY_ZARR_PATH,      "bathy_dataset_xr",   "Copernicus Bathymetry (deptho)"),
        (PHY_ZARR_PATH,        "phy_dataset_xr",     "Physics"),
        (BGC_ZARR_PATH,        "bgc_dataset_xr",     "BGC"),
        (OCEAN_ZARR_PATH,      "ocean_dataset_xr",   "Legacy ocean"),
        (ARGO_ZARR_PATH,       "argo_dataset_xr",    "Argo"),
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

    # Load backup Zarr stores (created by create_backup.py)
    for path, attr_name, label in [
        (BACKUP_PHY_ZARR_PATH, "backup_phy_dataset_xr", "Backup Physics"),
        (BACKUP_BGC_ZARR_PATH, "backup_bgc_dataset_xr", "Backup BGC"),
    ]:
        if path.exists():
            try:
                ds = _safe_open_zarr(path)
                if ds is not None:
                    globals()[attr_name] = ds
                    # Extract backup_date from attrs if available
                    if attr_name == "backup_phy_dataset_xr":
                        bdate = ds.attrs.get("backup_date")
                        if bdate:
                            backup_date = str(bdate)
                            logger.info(f"[BACKUP] {label} loaded — snapshot date: {backup_date}")
                    logger.info(f"[BACKUP OK] {label} zarr: {dict(ds.sizes)}")
            except Exception as e:
                logger.warning(f"[BACKUP WARN] {label} zarr open failed: {e}")
        else:
            logger.info(f"[BACKUP] {label} zarr not found at {path} (run create_backup.py to generate)")

    logger.info("=" * 60)
    logger.info("[PRE-WARM] Scheduling home-region pre-warm...")
    # Schedule the async pre-warm; it runs once startup is complete
    asyncio.ensure_future(_prewarm_home_regions())



# ==============================================================================
# Zarr slice helpers
# ==============================================================================

def _select_point(ds: xr.Dataset, lat: float, lon: float, tolerance: Optional[float] = None) -> xr.Dataset:
    tol = tolerance if tolerance is not None else (0.5 if (ds is bgc_dataset_xr or "bgc" in getattr(ds, "title", "").lower()) else 0.2)
    return ds.sel({_lat_coord(ds): lat, _lon_coord(ds): lon}, method="nearest", tolerance=tol)


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
    """Read physics variables from L2 zarr at nearest grid point with date verification.
    Returns only variables actually present in the store; never synthesises missing ones.
    """
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
            # Depth tolerance: if nearest level is too far away, return no data
            tol = max(25.0, depth * 0.15)
            if abs(actual_depth - depth) > tol:
                return {}

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
        missing_vars = []
        for src, dst in var_map.items():
            if src in pt:
                val = _safe_float(pt[src].values)
                result[dst] = val
            else:
                missing_vars.append(src)

        if result.get("temperature_c") is None and result.get("salinity_psu") is None and \
           result.get("current_u_ms") is None:
            return {}

        if missing_vars:
            result["missing_variables"] = missing_vars

        # Compute speed and heading for current vectors
        u = result.get("current_u_ms")
        v = result.get("current_v_ms")
        if u is not None and v is not None:
            result["current_speed_ms"] = round(math.sqrt(u * u + v * v), 3)
            result["current_heading_deg"] = round((math.atan2(v, u) * 180.0 / math.pi) % 360.0, 1)

        return result
    except Exception as e:
        logger.warning(f"[L2 phy point] read failed ({type(e).__name__}): {e}")
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
    use_backup: bool = False,
) -> Tuple[List[Dict], Optional[float], str, bool]:
    """Return (rows, actual_depth, actual_date, is_reference).
    If exact_date is True, requires date_str to exist in dataset time steps.
    If exact_date is False, allows nearest 3D depth/time slice as a reference view.
    If use_backup is True, reads from the backup_phy zarr instead of live zarr.
    """
    global phy_dataset_xr, backup_phy_dataset_xr
    if use_backup:
        # Use backup zarr (from create_backup.py)
        ds = backup_phy_dataset_xr
        if ds is None and BACKUP_PHY_ZARR_PATH.exists():
            try:
                backup_phy_dataset_xr = xr.open_zarr(BACKUP_PHY_ZARR_PATH)
                ds = backup_phy_dataset_xr
            except Exception:
                pass
    else:
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
                tol = max(25.0, depth * 0.15)
                if abs(actual_depth - depth) > tol:
                    return [], None, date_str, False

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

        # Adaptive downsampling: target ~100 pts/axis for smooth 3D terrain.
        # Per-axis strides let lat/lon aspect stay correct for non-square regions.
        n_lats_raw, n_lons_raw = len(lats), len(lons)
        stride_lat = max(1, int(math.ceil(n_lats_raw / 100.0)))
        stride_lon = max(1, int(math.ceil(n_lons_raw / 120.0)))
        if stride_lat > 1 or stride_lon > 1:
            lats = lats[::stride_lat]
            lons = lons[::stride_lon]
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


# Tracks keys of range-fetch tasks that have already failed once.
# We do NOT retry them automatically — caller must request again later.
_failed_fetch_keys: set = set()


def _schedule_bg_range_fetch(
    lat_min: float, lat_max: float,
    lon_min: float, lon_max: float,
    depth: float, date_str: str,
) -> Optional[asyncio.Task]:
    """
    Trigger ONE bounded background ingestion for a bounding box at given depth layer.
    Guardrails:
    - Deduplicates: if the same key is already running, returns the existing task.
    - No-retry: if the key previously failed, returns None immediately.
    - Hard timeout: 180s per fetch (enforced inside fetch_phy_range).
    - Depth clamped to COPERNICUS_MIN_DEPTH.
    """
    task_key = f"range:{lat_min:.2f}:{lat_max:.2f}:{lon_min:.2f}:{lon_max:.2f}:{depth:.1f}:{date_str}"
    if task_key in _fetch_tasks:
        return _fetch_tasks[task_key]  # already in flight
    if task_key in _failed_fetch_keys:
        logger.debug(f"[BG RANGE FETCH] Skipping previously-failed key: {task_key}")
        return None  # no retry after failure
    if not _fetcher.credentials_present():
        return None

    # Clamp depth to Copernicus minimum (0.494m)
    depth_min = _clamp_depth_min(max(0.0, depth - 25.0))
    depth_max = depth + 25.0

    async def _runner():
        try:
            async def _on_tile(tlat_min, tlat_max, tlon_min, tlon_max):
                loop = asyncio.get_event_loop()
                await loop.run_in_executor(None, _reload_phy_zarr)
                _notify_fetch_complete(task_key, (tlat_min + tlat_max) / 2, (tlon_min + tlon_max) / 2, depth, date_str)

            cache_stats["fetches"] += 1
            res = await asyncio.wait_for(
                _fetcher.fetch_phy_range(
                    lat_min, lat_max, lon_min, lon_max,
                    depth_min=depth_min, depth_max=depth_max,
                    date_str=date_str,
                    page_table=page_table,
                    on_tile_complete=_on_tile,
                ),
                timeout=180.0,
            )
            if res.get("status") == "success":
                logger.info(f"[BG RANGE FETCH] Ingested real Copernicus data for {task_key}")
            else:
                logger.warning(f"[BG RANGE FETCH] Fetch returned non-success for {task_key}: {res}")
                _failed_fetch_keys.add(task_key)
        except asyncio.TimeoutError:
            logger.error(f"[BG RANGE FETCH] Timed out (180s) for {task_key}")
            _failed_fetch_keys.add(task_key)
        except Exception as e:
            logger.error(f"[BG RANGE FETCH] Failed for {task_key}: {e}")
            _failed_fetch_keys.add(task_key)
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
        Kick off ONE bounded Copernicus fetch per tile; when they complete the
        pages upgrade from synthetic → real data transparently.
        Max 1 retry. No infinite loop.
    """
    # Use latest_available_iso — same as all other endpoints.
    # yesterday_iso() can point to a date Copernicus hasn't published yet.
    date_str = latest_available_iso()
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

            # Pin in page table — global ocean tiles get extra-strong pinning
            is_global_pinned = label in GLOBAL_PINNED_OCEAN_LABELS
            for lat_b in range(int(lat_min // LAT_BIN_DEG), int(lat_max // LAT_BIN_DEG) + 1):
                for lon_b in range(int(lon_min // LON_BIN_DEG), int(lon_max // LON_BIN_DEG) + 1):
                    for depth_b in range(0, 3):  # 0–6 m surface bins
                        page_table.register_pinned(lat_b, lon_b, depth_b, date_str)

            _prewarm_status[label] = "synthetic"
            if is_global_pinned:
                logger.info(f"[PRE-WARM] {label}: GLOBAL PINNED (never evicted)")
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
        """
        ONE bounded Copernicus fetch for the home region tile.
        Fetches 0–200m at surface: clamped to COPERNICUS_MIN_DEPTH (~0.494m).
        Max 1 attempt. No retry loop. No background-forever task.
        """
        try:
            # Clamp depth_min to Copernicus minimum (0.494m) — sending 0.0 causes
            # "depth coordinate not found" errors from the dataset API.
            eff_depth_min = _clamp_depth_min(0.0)
            eff_depth_max = 200.0  # surface + shallow layers only
            phy_res = await asyncio.wait_for(
                _fetcher.fetch_phy_range(
                    l_min, l_max, ln_min, ln_max,
                    depth_min=eff_depth_min, depth_max=eff_depth_max,
                    date_str=d_str,
                ),
                timeout=180.0,  # hard timeout: 3 minutes per tile
            )
            if phy_res.get("status") == "success":
                _prewarm_status[lbl] = "real"
                loop = asyncio.get_event_loop()
                await loop.run_in_executor(None, _reload_phy_zarr)
                result = await loop.run_in_executor(
                    None,
                    lambda: _read_phy_grid(l_min, l_max, ln_min, ln_max, eff_depth_min, d_str),
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
                        "depth": eff_depth_min, "date": d_str, "grid": real_grid,
                        "coverage": {
                            "total_points": len(real_grid),
                            "physics_coverage_pct": 100.0,
                            "bgc_coverage_pct": 0.0,
                        },
                    }
                    l1_set(snap_key, snap_data)
                logger.info(f"[PRE-WARM] {lbl}: upgraded to real Copernicus data")
            else:
                logger.info(f"[PRE-WARM] {lbl}: fetch returned {phy_res.get('status')} — keeping synthetic")
        except asyncio.TimeoutError:
            logger.warning(f"[PRE-WARM] {lbl}: timed out after 180s — keeping synthetic")
        except Exception as e:
            logger.debug(f"[PRE-WARM] {lbl} real fetch failed: {e}")
        finally:
            # Always mark done (no retry)
            if _prewarm_status.get(lbl) not in ("real",):
                _prewarm_status.setdefault(lbl, "synthetic")

    for label, lat_min, lat_max, lon_min, lon_max in PREWARM_REGIONS:
        asyncio.create_task(_prewarm_region_task(label, lat_min, lat_max, lon_min, lon_max, date_str))

    # Phase 2b — static bathymetry (deptho).
    # Fetch once for the Indian Ocean home region.  The 1.5° pad in fetch_bathy_range()
    # gives enough coverage for the default view.  Subsequent fetches for other regions
    # should be triggered by their respective /ocean/volume-full calls if needed.
    async def _prewarm_bathy_task():
        global bathy_dataset_xr
        try:
            # Indian Ocean home region — match PREWARM_REGIONS tile + wider view
            bathy_res = await asyncio.wait_for(
                _fetcher.fetch_bathy_range(
                    lat_min=6.0, lat_max=26.0,
                    lon_min=58.0, lon_max=97.0,
                ),
                timeout=300.0,
            )
            status = bathy_res.get("status")
            if status == "success":
                # Reload the zarr handle so _read_phy_volume_full_data picks it up
                try:
                    bathy_dataset_xr = xr.open_zarr(
                        _fetcher.BATHY_ZARR_PATH, consolidated=True
                    )
                    logger.info("[PRE-WARM BATHY] bathy_dataset_xr reloaded after fetch")
                except Exception as _rle:
                    logger.warning(f"[PRE-WARM BATHY] zarr reload failed: {_rle}")
            elif status == "cached":
                logger.info("[PRE-WARM BATHY] bbox already cached — no re-fetch needed")
            else:
                logger.warning(f"[PRE-WARM BATHY] fetch returned status={status}")
        except asyncio.TimeoutError:
            logger.warning("[PRE-WARM BATHY] timed out after 300s")
        except Exception as _be:
            logger.warning(f"[PRE-WARM BATHY] unexpected error: {_be}")

    asyncio.create_task(_prewarm_bathy_task())


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
    allow_antimeridian: bool = True,
):
    """Validate spatial coordinates are within valid geographical ranges [-90, 90] and [-180, 180]."""
    if not (-90.0 <= lat_min <= 90.0 and -90.0 <= lat_max <= 90.0):
        raise HTTPException(400, "Latitude must be within [-90.0, 90.0] degrees")
    if not (-180.0 <= lon_min <= 180.0 and -180.0 <= lon_max <= 180.0):
        raise HTTPException(400, "Longitude must be within [-180.0, 180.0] degrees")
    if lat_min > lat_max:
        raise HTTPException(400, f"lat_min ({lat_min}) cannot be greater than lat_max ({lat_max})")
    if not allow_antimeridian and lon_min > lon_max:
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

    Priority tier:
      1. Live Zarr exact date (L2)
      2a. Live Zarr nearest date (L2 reference)
      2b. Backup Zarr nearest date (Indian Ocean only: 4N-26N, 62E-96E)
      3. Analytically-generated demo volume (non-Indian-Ocean or Zarr empty)
         — labeled source="analytical_demo", placeholder=True
         — NOT real scientific measurements
    """
    _validate_spatial_bounds(lat_min, lat_max, lon_min, lon_max, allow_antimeridian=True)
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

    cache_key = (
        f"vol:{lat_min:.2f}:{lat_max:.2f}:{lon_min:.2f}:{lon_max:.2f}:"
        f"{','.join(str(d) for d in depth_list)}:{date_str}:{variable}"
    )
    cached = l1_get(cache_key)
    if cached:
        return {**cached, "cache": "L1_RAM", "elapsed_ms": round((time.perf_counter() - t0) * 1000, 2)}

    slices = []
    centre_lat = (lat_min + lat_max) / 2.0
    if lon_min <= lon_max:
        centre_lon = (lon_min + lon_max) / 2.0
        lon_span = max(0.01, lon_max - lon_min)
    else:
        lon_span = (180.0 - lon_min) + (lon_max - (-180.0))
        centre_lon = ((lon_min + lon_span / 2.0 + 180.0) % 360.0) - 180.0

    centre_lat_b = int(math.floor(centre_lat / LAT_BIN_DEG))
    centre_lon_b = int(math.floor(centre_lon / LON_BIN_DEG))

    global backup_date, backup_phy_dataset_xr
    if backup_phy_dataset_xr is None and BACKUP_PHY_ZARR_PATH.exists():
        try:
            backup_phy_dataset_xr = xr.open_zarr(BACKUP_PHY_ZARR_PATH)
            bdate = backup_phy_dataset_xr.attrs.get("backup_date")
            if not bdate and "time" in backup_phy_dataset_xr.coords:
                bdate = str(backup_phy_dataset_xr["time"].values[0])[:10]
            if bdate:
                backup_date = str(bdate)
        except Exception:
            pass

    _backup_available = backup_phy_dataset_xr is not None or BACKUP_PHY_ZARR_PATH.exists()

    # Backup Zarr coverage: Indian Ocean 4N-26N, 62E-96E
    BACKUP_LAT_MIN, BACKUP_LAT_MAX = 4.0, 26.0
    BACKUP_LON_MIN, BACKUP_LON_MAX = 62.0, 96.0
    overlap_lat = max(0.0, min(lat_max, BACKUP_LAT_MAX) - max(lat_min, BACKUP_LAT_MIN))
    if lon_min <= lon_max:
        overlap_lon = max(0.0, min(lon_max, BACKUP_LON_MAX) - max(lon_min, BACKUP_LON_MIN))
    else:
        overlap_lon = (
            max(0.0, min(180.0, BACKUP_LON_MAX) - max(lon_min, BACKUP_LON_MIN)) +
            max(0.0, min(lon_max, BACKUP_LON_MAX) - max(-180.0, BACKUP_LON_MIN))
        )
    region_area = max(0.01, (lat_max - lat_min) * lon_span)
    backup_frac = (overlap_lat * overlap_lon) / region_area
    USE_ANALYTICAL_DEMO = backup_frac < 0.20  # <20% overlap with Indian Ocean backup

    COPERNICUS_DEPTH_LEVELS = COPERNICUS_FULL_50_DEPTHS

    def _nearest_copernicus_depth(depth_val: float) -> float:
        return min(COPERNICUS_DEPTH_LEVELS, key=lambda d_lvl: abs(d_lvl - depth_val))

    def _ocean_sst(lat: float, lon: float) -> float:
        """Physical SST formula with latitude, gyre dynamics, and realistic ranges."""
        lat_rad = math.radians(lat)
        base = 28.5 * math.cos(lat_rad) ** 0.8
        lon_factor = 1.2 * math.sin(math.radians(lon * 2.0))
        if lat < -40:
            base -= (abs(lat) - 40) * 0.40
        if lat > 50:
            base -= (abs(lat) - 50) * 0.45
        if lat > 70:
            base -= (lat - 70) * 0.6
        noise = 0.6 * math.sin(lat * 3.7 + lon * 2.1) + 0.4 * math.cos(lat * 5.3 - lon * 1.9)
        return round(max(-2.0, min(32.0, base + lon_factor + noise)), 3)

    def _ocean_sss(lat: float, lon: float) -> float:
        """Surface salinity (PSU) analytical model."""
        lat_abs = abs(lat)
        base = 35.0
        if lat_abs < 5:     base -= 0.8
        elif lat_abs < 20:  base += 0.6
        elif lat_abs < 45:  base += 0.3
        else:               base -= 1.2
        noise = 0.3 * math.sin(lat * 4.1 + lon * 1.3)
        return round(max(30.0, min(38.0, base + noise)), 3)

    def _ocean_currents(lat: float, lon: float) -> Tuple[float, float]:
        """Simplified geostrophic-like current vectors (m/s)."""
        u = 0.08 * math.cos(math.radians(lat * 2.0)) * math.sin(math.radians(lon * 0.5))
        v = 0.05 * math.sin(math.radians(lat * 1.5))
        if lat < -45:  # ACC
            u = 0.22 + 0.06 * math.sin(math.radians(lon * 0.8))
            v = 0.04 * math.cos(math.radians(lon * 0.8))
        if 25 <= lat <= 45 and -80 <= lon <= -30:  # Gulf Stream
            u = 0.35 * math.exp(-abs(lat - 35) / 8.0)
            v = 0.12 * math.exp(-abs(lat - 35) / 8.0)
        if 20 <= lat <= 40 and 130 <= lon <= 165:  # Kuroshio
            u = 0.30 * math.exp(-abs(lat - 30) / 9.0)
            v = 0.08 * math.exp(-abs(lat - 30) / 9.0)
        return round(u, 4), round(v, 4)

    def _synthesize_analytical_grid(
        la_min: float, la_max: float, lo_min: float, lo_max: float,
        depth: float, var: str, step: float = 2.0,
    ) -> List[Dict]:
        """Spatially-varying analytical demo grid with antimeridian wrapping support."""
        nd = _nearest_copernicus_depth(depth)
        depth_decay = math.exp(-nd / 220.0)
        sal_decay   = math.exp(-nd / 350.0)

        # Generate longitude coordinates (handling antimeridian wrap)
        lons = []
        if lo_min <= lo_max:
            cur_lo = lo_min
            while cur_lo <= lo_max + 1e-9:
                lons.append(round(cur_lo, 3))
                cur_lo += step
        else:
            cur_lo = lo_min
            while cur_lo <= 180.0:
                lons.append(round(cur_lo, 3))
                cur_lo += step
            cur_lo = -180.0
            while cur_lo <= lo_max + 1e-9:
                lons.append(round(cur_lo, 3))
                cur_lo += step

        # Generate latitude coordinates
        lats = []
        cur_la = la_min
        while cur_la <= la_max + 1e-9:
            lats.append(round(cur_la, 3))
            cur_la += step

        rows: List[Dict] = []
        for la in lats:
            for lo in lons:
                sst = _ocean_sst(la, lo)
                deep_temp = round(4.0 + (sst - 4.0) * depth_decay, 3)
                sss0 = _ocean_sss(la, lo)
                deep_sal  = round(34.7 + (sss0 - 34.7) * sal_decay, 3)
                u, v = _ocean_currents(la, lo)
                u_d  = round(u * depth_decay, 4)
                v_d  = round(v * depth_decay, 4)
                spd  = round(math.sqrt(u_d**2 + v_d**2), 4)
                lat_abs = abs(la)
                base_chl = 0.08 if 15 < lat_abs < 35 else (0.25 if lat_abs < 15 else 0.40)
                chl = round(max(0.01, base_chl + base_chl * 2.8 * math.exp(-((nd - 35.0) ** 2) / 320.0)
                                + 0.04 * math.sin(la * 5.0 + lo * 3.0)), 4)
                o2  = round(65.0 + 145.0 * depth_decay, 2)
                no3 = round(1.2  + 28.0  * (1.0 - math.exp(-nd / 60.0)), 2)
                ph  = round(8.12 - 0.30  * (1.0 - math.exp(-nd / 90.0)), 3)
                pco2 = round(395.0 + 85.0 * (1.0 - math.exp(-nd / 110.0)), 1)

                if var in ("salinity", "salinity_psu", "so"):
                    val = deep_sal
                elif var in ("currents", "current_speed", "speed", "velocity"):
                    val = spd
                elif var in ("chlorophyll", "chl"):
                    val = chl
                elif var in ("oxygen", "o2"):
                    val = o2
                elif var in ("nitrate", "no3"):
                    val = no3
                elif var in ("ph", "pH"):
                    val = ph
                elif var in ("pco2", "spco2"):
                    val = pco2
                else:
                    val = deep_temp

                rows.append({
                    "lat": round(la, 3), "lon": round(lo, 3),
                    "depth_m": nd, "requested_depth_m": depth, "actual_depth_m": nd,
                    "temperature_c": deep_temp, "salinity_psu": deep_sal,
                    "current_u_ms": u_d, "current_v_ms": v_d, "current_speed_ms": spd,
                    "chlorophyll_mgl": chl, "oxygen_mmolm3": o2,
                    "nitrate_mmolm3": no3, "ph": ph, "pco2_uatm": pco2,
                    "value": val,
                    "placeholder": True, "source": "analytical_demo",
                })
        return rows

    for d in depth_list:
        depth_b = int(math.floor(d / DEPTH_BIN_M))
        layer_state_val = page_table.get_page_state(
            centre_lat_b, centre_lon_b, depth_b, date_str
        ).value.lower()

        loop = asyncio.get_event_loop()
        slice_src_tag = "copernicus_zarr"

        # --- Tier 1: Try exact-date data from live zarr (L2) ---
        grid, actual_depth, actual_date, is_ref = await loop.run_in_executor(
            None,
            lambda _d=d: _read_phy_grid(lat_min, lat_max, lon_min, lon_max, _d, date_str, exact_date=True),
        )

        if not grid:
            # --- Tier 2a: Try nearest-date data from live zarr (L2 reference) ---
            grid, actual_depth, actual_date, is_ref = await loop.run_in_executor(
                None,
                lambda _d=d: _read_phy_grid(lat_min, lat_max, lon_min, lon_max, _d, date_str, exact_date=False),
            )
            if grid:
                slice_src_tag = "copernicus_zarr_reference"

        if not grid and _backup_available:
            # --- Tier 2b: Try backup zarr (any region overlap) ---
            grid, actual_depth, actual_date, is_ref = await loop.run_in_executor(
                None,
                lambda _d=d: _read_phy_grid(lat_min, lat_max, lon_min, lon_max, _d, date_str, exact_date=False, use_backup=True),
            )
            if grid:
                slice_src_tag = "backup_cache"

        if not grid:
            # Schedule background ingestion asynchronously without blocking the loop
            _schedule_bg_range_fetch(lat_min, lat_max, lon_min, lon_max, d, date_str)

            if not grid:
                # Balanced grid scaled to region span: target ~35 points per axis for fast 3D rendering (<100ms)
                max_dim = max(lat_max - lat_min, lon_span)
                step = max(0.35, min(1.5, max_dim / 35.0))
                grid = _synthesize_analytical_grid(lat_min, lat_max, lon_min, lon_max, d, variable, step)
                actual_depth = _nearest_copernicus_depth(d)
                actual_date = date_str
                is_ref = True
                slice_src_tag = "analytical_demo"
                layer_state_val = "fetching" if _fetcher.credentials_present() else "not_fetched"

        pts = []
        for r in grid:
            if variable in ("temperature", "temperature_c", "thetao", "temp"):
                val = r.get("temperature_c")
            elif variable in ("salinity", "salinity_psu", "so", "sal"):
                val = r.get("salinity_psu")
            elif variable in ("current_speed", "speed", "currents", "uo", "vo"):
                val = r.get("current_speed_ms")
            elif variable in ("chlorophyll", "chl"):
                val = r.get("chlorophyll_mgl")
            elif variable in ("oxygen", "o2", "dissolved_oxygen"):
                val = r.get("oxygen_mmolm3")
            else:
                val = r.get("temperature_c")
            pts.append({
                "lat": r["lat"], "lon": r["lon"], "value": val,
                "temperature_c": r.get("temperature_c"),
                "salinity_psu":  r.get("salinity_psu"),
                "current_u_ms":  r.get("current_u_ms"),
                "current_v_ms":  r.get("current_v_ms"),
                "current_speed_ms": r.get("current_speed_ms"),
                "chlorophyll_mgl": r.get("chlorophyll_mgl"),
                "oxygen_mmolm3":   r.get("oxygen_mmolm3"),
            })

        slices.append({
            "depth_m": d,
            "requested_depth_m": d,
            "actual_depth_m": actual_depth if actual_depth is not None else d,
            "layer_state": layer_state_val,
            "is_reference_slice": is_ref,
            "reference_date": actual_date if is_ref else None,
            "actual_date": actual_date or date_str,
            "source": slice_src_tag,
            "n_points": len(pts),
            "points": pts,
        })

    # Fetch active Argo floats for bounding box with non-blocking 2.5s timeout
    try:
        if lon_min <= lon_max:
            floats_res = await asyncio.wait_for(
                _argo.fetch_active_floats(lat_min, lat_max, lon_min, lon_max, days=60, float_type="both"),
                timeout=2.5,
            )
            raw_floats = floats_res.get("floats", []) if isinstance(floats_res, dict) else []
        else:
            f1_task = _argo.fetch_active_floats(lat_min, lat_max, lon_min, 180.0, days=60, float_type="both")
            f2_task = _argo.fetch_active_floats(lat_min, lat_max, -180.0, lon_max, days=60, float_type="both")
            f1, f2 = await asyncio.wait_for(asyncio.gather(f1_task, f2_task, return_exceptions=True), timeout=2.5)
            f1_list = f1.get("floats", []) if isinstance(f1, dict) else []
            f2_list = f2.get("floats", []) if isinstance(f2, dict) else []
            raw_floats = f1_list + f2_list
    except (asyncio.TimeoutError, Exception) as exc:
        logger.debug(f"[ocean_volume] Argo fetch skipped or timed out: {exc}")
        raw_floats = []

    enriched_floats = _enrich_floats_for_3d(raw_floats, lat_min, lat_max, lon_min, lon_max)

    if any(s.get("source") == "copernicus_zarr" for s in slices):
        vol_source = "copernicus_zarr"
    elif any(s.get("source") == "backup_cache" for s in slices):
        vol_source = "backup_cache"
    elif any(s.get("source") == "copernicus_zarr_reference" for s in slices):
        vol_source = "copernicus_zarr_reference"
    elif any(s.get("source") == "analytical_demo" for s in slices):
        vol_source = "analytical_demo"
    else:
        vol_source = "no_data"

    effective_backup_date = backup_date
    if vol_source == "backup_cache" and not effective_backup_date:
        for s in slices:
            if s.get("actual_date"):
                effective_backup_date = s["actual_date"]
                break

    # Determine loading state for the frontend
    is_fetching = any(s.get("layer_state") == "fetching" for s in slices)
    has_real_data = vol_source in ("copernicus_zarr", "backup_cache", "copernicus_zarr_reference")

    if has_real_data:
        fetch_status = "cache_hit"
    elif is_fetching:
        fetch_status = "fetching"
    else:
        fetch_status = "analytical_placeholder"

    # Bathymetry extraction for subset volume
    bathy_grid = []
    bathy_lats = []
    bathy_lons = []
    bathy_max = 5727.917
    bathy_source_label = "none"

    global bathy_dataset_xr
    if bathy_dataset_xr is None and BATHY_ZARR_PATH.exists():
        bathy_dataset_xr = _safe_open_zarr(BATHY_ZARR_PATH)

    if not _is_bathy_covered(lat_min, lat_max, lon_min, lon_max) and _fetcher.credentials_present():
        # Kick off background bathymetry fetch without blocking the response
        asyncio.create_task(_fetch_and_reload_bathy(lat_min, lat_max, lon_min, lon_max))

    # Always build an independent lat/lon grid for bathymetry —
    # do NOT depend on slice points (which may be empty or coarse analytical data).
    _n_bathy = 100
    bathy_lats = [
        round(lat_min + i * (lat_max - lat_min) / (_n_bathy - 1), 3)
        for i in range(_n_bathy)
    ] if lat_max > lat_min else [round(lat_min, 3)]
    if lon_max >= lon_min:
        bathy_lons = [round(lon_min + j * (lon_max - lon_min) / (_n_bathy - 1), 3) for j in range(_n_bathy)]
    else:  # crosses 180 deg
        _sp = lon_max + 360.0 - lon_min
        bathy_lons = [round(((lon_min + j * _sp / (_n_bathy - 1) + 180.0) % 360.0) - 180.0, 3) for j in range(_n_bathy)]

    if bathy_dataset_xr is not None and "deptho" in bathy_dataset_xr and bathy_lats and bathy_lons:
        try:
            blc = _lat_coord(bathy_dataset_xr)
            blnc = _lon_coord(bathy_dataset_xr)
            b_reg = bathy_dataset_xr["deptho"].reindex({blc: bathy_lats, blnc: bathy_lons}, method="nearest", tolerance=0.25).values
            finite_vals = b_reg[np.isfinite(b_reg)]
            if finite_vals.size > 0:
                bathy_grid = [
                    [None if not np.isfinite(val) else round(float(val), 2) for val in row]
                    for row in b_reg
                ]
                bathy_max = round(float(finite_vals.max()), 1)
                bathy_source_label = "copernicus_deptho"
                logger.info(
                    f"[BATHY /volume] copernicus_deptho: shape=({len(bathy_grid)}×{len(bathy_grid[0]) if bathy_grid else 0}) "
                    f"distinct={len(set(v for r in bathy_grid for v in r if v is not None))} max={bathy_max}m"
                )
        except Exception as _bex:
            logger.warning(f"[BATHY /volume] deptho sel failed: {_bex}")
            bathy_grid = []

    if not bathy_grid and bathy_lats and bathy_lons:
        bathy_grid = [
            [_physical_bathymetry_relief(la, lo) for lo in bathy_lons]
            for la in bathy_lats
        ]
        bathy_max = max(max(row) for row in bathy_grid)
        bathy_source_label = "physical_relief_model"

    result = {
        "status": "ok" if vol_source != "no_data" else "no_data",
        "fetch_status": fetch_status,
        "bbox": {"lat_min": lat_min, "lat_max": lat_max, "lon_min": lon_min, "lon_max": lon_max},
        "date": date_str,
        "actual_date": effective_backup_date if vol_source == "backup_cache" else date_str,
        "source": vol_source,
        "backup_date": effective_backup_date if vol_source == "backup_cache" else None,
        "data_source": vol_source,
        "n_slices": len(slices),
        "variable": variable,
        "depth_slices": slices,
        "bathymetry": bathy_grid,
        "bathymetry_lats": bathy_lats,
        "bathymetry_lons": bathy_lons,
        "bathymetry_source": bathy_source_label,
        "max_depth_m": bathy_max,
        "depth_levels_m": [s.get("actual_depth_m") for s in slices],
        "floats": enriched_floats,
        "is_reference": vol_source in ("analytical_demo", "copernicus_zarr_reference", "backup_cache"),
        "disclaimer": (
            "Analytical demo data based on physical ocean equations. NOT real Copernicus measurements. "
            "Background fetch in progress — real data will replace this when ready."
            if vol_source == "analytical_demo" and fetch_status == "fetching"
            else (
                "Analytical demo data based on physical ocean equations. NOT real Copernicus measurements."
                if vol_source == "analytical_demo" else None
            )
        ),
        "cache": "NONE",
        "elapsed_ms": round((time.perf_counter() - t0) * 1000, 2),
    }
    # Only cache genuine data in L1 — do NOT cache placeholder/analytical results
    # (they should be replaced as soon as real Copernicus data arrives)
    if has_real_data:
        l1_set(cache_key, result)
    return result



# ==============================================================================
# /ocean/volume-anomaly — 3D volume with per-point anomaly scoring
# ==============================================================================

@app.get("/ocean/volume-anomaly")
async def ocean_volume_anomaly(
    lat_min: float = Query(...),
    lat_max: float = Query(...),
    lon_min: float = Query(...),
    lon_max: float = Query(...),
    depths: str = Query("0,10,50,100,200,500,1000"),
    date: Optional[str] = Query(None),
    variable: str = Query("temperature"),
):
    """
    3D volume slices with per-point anomaly scoring.
    For each point, computes anomaly_c = observed - AI_predicted temperature.
    Uses the trained PyTorch Ocean067 model when available.
    Falls back to statistical z-score when model is unavailable or coordinates are outside bounds.
    """
    vol_result = await ocean_volume(
        lat_min=lat_min, lat_max=lat_max,
        lon_min=lon_min, lon_max=lon_max,
        depths=depths, date=date, variable=variable,
    )

    import ai_inference as _ai_mod
    model_ready = getattr(_ai_mod, "_model", None) is not None
    date_str = resolve_date_input(date)

    anomaly_slices = []
    total_anomalies = 0

    for sl in vol_result.get("depth_slices", []):
        pts = sl.get("points", [])
        depth_m = float(sl.get("depth_m", 0))
        pressure_dbar = depth_m

        temps = [p.get("temperature_c") for p in pts if p.get("temperature_c") is not None]
        layer_mean = (sum(temps) / len(temps)) if temps else 20.0
        layer_std = math.sqrt(sum((t - layer_mean) ** 2 for t in temps) / len(temps)) if len(temps) > 1 else 1.0
        layer_std = max(layer_std, 0.1)

        preds = None
        if model_ready and pts:
            try:
                lats = np.array([float(p["lat"]) for p in pts], dtype=np.float32)
                lons = np.array([float(p["lon"]) for p in pts], dtype=np.float32)
                sals = np.array([float(p.get("salinity_psu") or 35.0) for p in pts], dtype=np.float32)
                preds = _ai_mod.predict_temperatures_batch(lats, lons, pressure_dbar, sals, date_str)
            except Exception as exc:
                logger.debug(f"[volume_anomaly] batch prediction fallback: {exc}")
                preds = None

        anomaly_pts = []
        for i, p in enumerate(pts):
            obs_temp = p.get("temperature_c")
            if obs_temp is None:
                anomaly_pts.append({**p, "anomaly_c": None, "anomaly_score": 0.0, "is_anomaly": False})
                continue

            if preds is not None:
                predicted = float(preds[i])
                anomaly_c = round(obs_temp - predicted, 4)
                threshold = getattr(_ai_mod, "_anomaly_thr", 2.0)
                anomaly_score = round(abs(anomaly_c) / max(threshold, 0.001), 4)
                is_anomaly = abs(anomaly_c) >= threshold
            else:
                anomaly_c = round(obs_temp - layer_mean, 4)
                anomaly_score = round(abs(anomaly_c) / layer_std, 4)
                is_anomaly = anomaly_score >= 1.8

            if is_anomaly:
                total_anomalies += 1

            anomaly_pts.append({
                **p,
                "anomaly_c": anomaly_c,
                "anomaly_score": anomaly_score,
                "is_anomaly": is_anomaly,
                "direction": "warmer" if (anomaly_c and anomaly_c > 0) else ("colder" if (anomaly_c and anomaly_c < 0) else "normal"),
            })

        anomaly_slices.append({
            **sl,
            "points": anomaly_pts,
            "layer_mean_temp": round(layer_mean, 3),
            "layer_std_temp": round(layer_std, 3),
            "model_used": "pytorch_ocean067" if model_ready else "statistical_zscore",
        })

    return {
        **vol_result,
        "depth_slices": anomaly_slices,
        "anomaly_mode": True,
        "total_anomalies_detected": total_anomalies,
        "model_used": "pytorch_ocean067" if model_ready else "statistical_zscore",
    }


# ==============================================================================
# /ocean/volume-full — Full-depth 3D volume using ALL available Zarr depth levels
# ==============================================================================
#
# Phase 1 FULL OCEAN MODE endpoint.
#
# Returns ALL depth levels present in the local phy_data.zarr for the requested
# bounding box, using the actual Copernicus depth coordinate array — NOT the
# 7-level subset used by /ocean/volume.
#
# Key differences from /ocean/volume:
#   - Uses every depth level in the Zarr (currently 18 levels, 0–47.4 m)
#   - Returns actual_zarr_depth_levels[] so the frontend knows the true range
#   - Includes copernicus_full_depth_levels[] (all 50 known Copernicus levels)
#   - Indicates available_depth_max_m — the deepest level in the local Zarr
#   - Does NOT fall back to analytical demo data for depths beyond the Zarr
#     (returns partial=True with a clear message instead)
#   - Intended for the FULL OCEAN MODE overlay only — separate from normal flow
# ==============================================================================

# All 50 standard Copernicus NEMO depth levels (ANFC + GLORYS12)
# All 50 standard Copernicus NEMO depth levels (ANFC + GLORYS12)
COPERNICUS_FULL_50_DEPTHS: List[float] = [
    0.494025, 1.541375, 2.645669, 3.819495, 5.078224,
    6.440614, 7.92956, 9.572997, 11.405, 13.467141,
    15.810017, 18.495560, 21.598820, 25.211393, 29.444731,
    34.434326, 40.344238, 47.373692, 55.764290, 65.807495,
    77.853851, 92.326073, 109.729034, 130.666016, 155.850723,
    186.125488, 222.475241, 266.040344, 318.127411, 380.213013,
    453.937744, 541.088867, 643.566772, 763.333191, 902.339233,
    1062.43896, 1245.29102, 1452.25098, 1684.28406, 1941.89342,
    2225.07764, 2533.33618, 2865.70264, 3220.81958, 3597.03223,
    3992.48438, 4405.22461, 4833.29004, 5274.78418, 5727.91699,
]


@app.get("/ocean/depth-levels")
async def ocean_depth_levels():
    global demo_full_depth_xr, phy_dataset_xr, backup_phy_dataset_xr
    if demo_full_depth_xr is None and DEMO_FULL_DEPTH_PATH.exists():
        demo_full_depth_xr = _safe_open_zarr(DEMO_FULL_DEPTH_PATH)
    best, best_src, best_max = None, "copernicus_standard", 0.0
    for cand, name in [(demo_full_depth_xr, "demo_full_depth"), (phy_dataset_xr, "phy_data"),
                       (backup_phy_dataset_xr, "backup_cache")]:
        if cand is not None and "depth" in cand.dims:
            m = float(cand["depth"].values.max())
            if m > best_max:
                best, best_src, best_max = cand, name, m
    # Use local store only if it has a meaningful depth range (>= 20 levels AND > 2000m)
    # A 7-level / 1000m store is too shallow to drive the depth UI — fall through to full 50-level grid
    if best is not None and best_max >= 2000.0 and len(best["depth"].values) >= 20:
        depths = [round(float(d), 4) for d in best["depth"].values]
        src_label = best_src
    else:  # local store is shallow -> use the real 50-level Copernicus grid
        depths = COPERNICUS_FULL_50_DEPTHS
        src_label = "copernicus_standard"
        logger.info(f"[depth-levels] local store max={best_max:.1f}m levels={len(best['depth'].values) if best is not None else 0} — using full Copernicus 50-level grid")
    return {"source": src_label, "native_depth_count": len(depths), "native_depths": depths,
            "depth_levels_m": depths, "max_depth_m": round(float(depths[-1]), 3),
            "local_max_depth_m": round(best_max, 3)}


def _is_bathy_covered(lat_min: float, lat_max: float, lon_min: float, lon_max: float) -> bool:
    """
    Check whether the existing bathy_data.zarr already covers >50% of the requested bbox.
    Handles antimeridian-crossing bboxes (lon_min > lon_max, e.g. Southern/Pacific Ocean).
    """
    global bathy_dataset_xr
    if bathy_dataset_xr is None and BATHY_ZARR_PATH.exists():
        bathy_dataset_xr = _safe_open_zarr(BATHY_ZARR_PATH)
    if bathy_dataset_xr is None or "deptho" not in bathy_dataset_xr:
        return False
    try:
        lc = _lat_coord(bathy_dataset_xr)
        lnc = _lon_coord(bathy_dataset_xr)
        b_lats = bathy_dataset_xr[lc].values
        b_lons = bathy_dataset_xr[lnc].values
        if len(b_lats) == 0 or len(b_lons) == 0:
            return False

        overlap_lat = max(0.0, min(lat_max, float(b_lats.max())) - max(lat_min, float(b_lats.min())))
        req_lat = max(0.001, lat_max - lat_min)

        # Antimeridian-aware longitude overlap
        is_antimeridian = lon_min > lon_max
        if is_antimeridian:
            # Request wraps: lon_min..180 + -180..lon_max
            req_lon = (180.0 - lon_min) + (lon_max - (-180.0))
            # Bathy coverage on each half-segment
            overlap_east  = max(0.0, min(180.0, float(b_lons.max())) - max(lon_min, float(b_lons.min())))
            overlap_west  = max(0.0, min(lon_max, float(b_lons.max())) - max(-180.0, float(b_lons.min())))
            overlap_lon = overlap_east + overlap_west
        else:
            req_lon = max(0.001, lon_max - lon_min)
            overlap_lon = max(0.0, min(lon_max, float(b_lons.max())) - max(lon_min, float(b_lons.min())))

        req_lon = max(0.001, req_lon)
        return (overlap_lat / req_lat > 0.5) and (overlap_lon / req_lon > 0.5)
    except Exception:
        return False


async def _fetch_and_reload_bathy(lat_min: float, lat_max: float, lon_min: float, lon_max: float):
    global bathy_dataset_xr
    try:
        res = await _fetcher.fetch_bathy_range(lat_min, lat_max, lon_min, lon_max)
        if res.get("status") in ("success", "cached"):
            bds = _safe_open_zarr(BATHY_ZARR_PATH)
            if bds is not None:
                bathy_dataset_xr = bds
                logger.info(f"[BATHY RELOAD] bathy_dataset_xr updated for lat=[{lat_min},{lat_max}], lon=[{lon_min},{lon_max}]")
    except Exception as e:
        logger.warning(f"[BATHY RELOAD] failed: {e}")


def _read_phy_volume_full_data(
    lat_min: float, lat_max: float,
    lon_min: float, lon_max: float,
    date_str: str,
) -> Dict[str, Any]:
    global demo_full_depth_xr, demo_bathymetry_xr, bathy_dataset_xr, phy_dataset_xr, backup_phy_dataset_xr, ocean_dataset_xr

    if demo_full_depth_xr is None and DEMO_FULL_DEPTH_PATH.exists():
        try:
            demo_full_depth_xr = xr.open_zarr(DEMO_FULL_DEPTH_PATH)
        except Exception:
            pass

    if demo_bathymetry_xr is None and DEMO_BATHYMETRY_PATH.exists():
        try:
            demo_bathymetry_xr = xr.open_zarr(DEMO_BATHYMETRY_PATH)
        except Exception:
            pass

    # Lazy-load Copernicus bathymetry zarr if written by a previous run
    if bathy_dataset_xr is None and BATHY_ZARR_PATH.exists():
        try:
            bathy_dataset_xr = xr.open_zarr(BATHY_ZARR_PATH, consolidated=True)
            lc = _lat_coord(bathy_dataset_xr)
            lnc = _lon_coord(bathy_dataset_xr)
            logger.info(
                f"[L2 OK] Copernicus bathy zarr loaded: "
                f"lat={list(bathy_dataset_xr[lc].values[[0,-1]])}, "
                f"lon={list(bathy_dataset_xr[lnc].values[[0,-1]])}"
            )
        except Exception as _be:
            logger.warning(f"[BATHY] Could not open bathy_data.zarr: {_be}")

    if phy_dataset_xr is None and PHY_ZARR_PATH.exists():
        phy_dataset_xr = _safe_open_zarr(PHY_ZARR_PATH)
    if backup_phy_dataset_xr is None and BACKUP_PHY_ZARR_PATH.exists():
        backup_phy_dataset_xr = _safe_open_zarr(BACKUP_PHY_ZARR_PATH)

    # Select dataset — Copernicus live data takes priority over demo/backup.
    # Previous order (demo_full_depth first) caused real phy_data.zarr to be
    # bypassed whenever demo_full_depth.zarr existed on disk.
    ds = None
    source = "no_data"
    _best_md = -1.0
    for candidate, name in [
        (phy_dataset_xr, "copernicus_zarr"),
        (backup_phy_dataset_xr, "backup_cache"),
        (demo_full_depth_xr, "demo_full_depth"),
        (ocean_dataset_xr, "ocean_data"),
    ]:
        if candidate is None:
            continue
        try:
            lc, lnc = _lat_coord(candidate), _lon_coord(candidate)
            region = candidate.sel({lc: slice(lat_min, lat_max), lnc: slice(lon_min, lon_max)})
            if len(region[lc]) > 0 and len(region[lnc]) > 0:
                has_finite = False
                for tvar in ("thetao", "temperature"):
                    if tvar in region:
                        try:
                            if np.isfinite(region[tvar].values).any():
                                has_finite = True
                                break
                        except Exception:
                            pass
                if not has_finite:
                    continue
                _md = float(candidate["depth"].values.max()) if "depth" in candidate.dims else 0.0
                _n_depths = len(candidate["depth"].values) if "depth" in candidate.dims else 0
                logger.info(f"[volume-full] Candidate '{name}' accepted: {_n_depths} depths, max_depth={_md:.1f}m")
                if _md > _best_md:
                    _best_md, ds, source = _md, candidate, name
        except Exception as _cex:
            logger.debug(f"[volume-full] Candidate '{name}' skipped: {_cex}")

    _src_depth_count = 0
    if ds is not None and "depth" in ds.dims:
        _src_depth_count = len(ds["depth"].values)
    logger.info(
        f"[volume-full] Selected source='{source}', depth_count={_src_depth_count}, "
        f"bbox=lat[{lat_min},{lat_max}] lon[{lon_min},{lon_max}]"
    )

    if ds is None:
        return {
            "source": "copernicus_standard",
            "date": date_str,
            "bbox": {"lat_min": lat_min, "lat_max": lat_max, "lon_min": lon_min, "lon_max": lon_max},
            "native_depth_count": len(COPERNICUS_FULL_50_DEPTHS),
            "native_depths": COPERNICUS_FULL_50_DEPTHS,
            "max_depth_m": COPERNICUS_FULL_50_DEPTHS[-1],
            "bathymetry": [],
            "bathymetry_lats": [],
            "bathymetry_lons": [],
            "variables": ["temperature", "salinity", "u_current", "v_current"],
            "layers": [],
            "depth_slices": [],
        }

    try:
        lc, lnc = _lat_coord(ds), _lon_coord(ds)
        actual_date = date_str
        region_full = ds.sel({lc: slice(lat_min, lat_max), lnc: slice(lon_min, lon_max)})
        if "time" in region_full.coords:
            region_full = region_full.sel(time=np.datetime64(date_str), method="nearest")
            if "time" in region_full.coords:
                actual_date = str(region_full["time"].values)[:10]

        depth_vals = region_full["depth"].values if "depth" in region_full.dims else np.array(COPERNICUS_FULL_50_DEPTHS)
        depth_levels_m = [round(float(d), 4) for d in depth_vals]
        lats = [round(float(la), 4) for la in region_full[lc].values]
        lons = [round(float(lo), 4) for lo in region_full[lnc].values]

        n_lats, n_lons = len(lats), len(lons)
        n_depths = len(depth_levels_m)

        # Adaptive spatial downsampling: allow high detail (80-120 per axis)
        total_pts = n_lats * n_lons
        if total_pts > 14000:
            stride_lat = max(1, int(math.ceil(n_lats / 96.0)))
            stride_lon = max(1, int(math.ceil(n_lons / 120.0)))
            lats = lats[::stride_lat]
            lons = lons[::stride_lon]
            region_full = region_full.sel({lc: lats, lnc: lons})
            n_lats, n_lons = len(lats), len(lons)

        var_arrays: Dict[str, np.ndarray] = {}
        for src, dst in [("thetao", "temperature"), ("so", "salinity"),
                          ("uo", "u_current"), ("vo", "v_current")]:
            if src in region_full:
                arr = region_full[src].values
                while arr.ndim > 3:
                    arr = arr[0]
                if arr.ndim == 3 and arr.shape[0] == n_depths and arr.shape[1] == n_lats and arr.shape[2] == n_lons:
                    var_arrays[dst] = arr
                elif arr.ndim == 3 and arr.shape[0] == n_depths:
                    if arr.shape[1] == n_lons and arr.shape[2] == n_lats:
                        var_arrays[dst] = arr.transpose(0, 2, 1)

        # Bathymetry grid
        # Priority:
        #   1. Copernicus deptho from bathy_data.zarr (fetch_bathy_range output)
        #   2. Demo bathymetry from demo_bathymetry.zarr (download_full_depth.py output)
        #   3. Physical bathymetry terrain relief model (irregular trenches, ridges, slopes)
        bathy_grid = []
        bathy_max_depth: Optional[float] = None
        bathy_tier_used = "none"

        # 1. Copernicus deptho (preferred)
        if bathy_dataset_xr is None:
            logger.info("[BATHY DIAG] bathy_dataset_xr is None — no bathy_data.zarr on disk")
        elif "deptho" not in bathy_dataset_xr:
            logger.info(f"[BATHY DIAG] bathy_dataset_xr has no 'deptho' var, vars={list(bathy_dataset_xr.data_vars)}")
        else:
            try:
                blc = _lat_coord(bathy_dataset_xr)
                blnc = _lon_coord(bathy_dataset_xr)
                _bathy_lat_range = [float(bathy_dataset_xr[blc].values.min()), float(bathy_dataset_xr[blc].values.max())]
                _bathy_lon_range = [float(bathy_dataset_xr[blnc].values.min()), float(bathy_dataset_xr[blnc].values.max())]
                _req_covered = (
                    _bathy_lat_range[0] <= lat_min and _bathy_lat_range[1] >= lat_max
                    and _bathy_lon_range[0] <= lon_min and _bathy_lon_range[1] >= lon_max
                )
                logger.info(
                    f"[BATHY DIAG] bathy zarr coverage: lat={_bathy_lat_range}, lon={_bathy_lon_range}, "
                    f"request lat=[{lat_min},{lat_max}] lon=[{lon_min},{lon_max}], fully_covered={_req_covered}"
                )
                b_reg = bathy_dataset_xr["deptho"].reindex({blc: lats, blnc: lons}, method="nearest", tolerance=0.25).values
                finite_vals = b_reg[np.isfinite(b_reg)]
                if finite_vals.size > 0:
                    bathy_grid = [
                        [None if not np.isfinite(val) else round(float(val), 2) for val in row]
                        for row in b_reg
                    ]
                    bathy_tier_used = "copernicus_deptho"
                    bathy_max_depth = round(float(finite_vals.max()), 3)
                    logger.info(
                        f"[BATHY] Serving Copernicus deptho: "
                        f"distinct={len(np.unique(np.round(finite_vals, 2)))} values, "
                        f"min={float(finite_vals.min()):.1f}m, max={bathy_max_depth}m"
                    )
                else:
                    logger.info(f"[BATHY DIAG] reindex produced all-NaN ({b_reg.shape}), no finite deptho in region")
            except Exception as _bex:
                logger.warning(f"[BATHY] deptho sel failed: {_bex}")
                bathy_grid = []

        # 2. Demo bathymetry fallback
        if not bathy_grid and demo_bathymetry_xr is not None and "seafloor_depth_m" in demo_bathymetry_xr:
            try:
                blc = _lat_coord(demo_bathymetry_xr)
                blnc = _lon_coord(demo_bathymetry_xr)
                b_reg = demo_bathymetry_xr["seafloor_depth_m"].sel({blc: lats, blnc: lons}, method="nearest").values
                bathy_grid = [[None if not np.isfinite(val) else round(float(val), 2) for val in row] for row in b_reg]
                bathy_tier_used = "demo_bathymetry"
            except Exception:
                pass

        # 3. Physical bathymetry terrain relief model (irregular trenches, ridges, slopes)
        if not bathy_grid or len(bathy_grid) != n_lats or bathy_tier_used == "none":
            _reason = "no bathy_data.zarr" if bathy_dataset_xr is None else (
                "reindex all-NaN" if bathy_tier_used == "none" else f"grid mismatch ({len(bathy_grid)} vs {n_lats})"
            )
            logger.info(f"[BATHY] Falling back to physical_relief_model — reason: {_reason}")
            bathy_grid = [
                [_physical_bathymetry_relief(la, lo) for lo in lons]
                for la in lats
            ]
            bathy_tier_used = "physical_relief_model"
            bathy_max_depth = max(max(row) for row in bathy_grid)

        depth_slices = []
        t_arr = var_arrays.get("temperature")
        s_arr = var_arrays.get("salinity")
        u_arr = var_arrays.get("u_current")
        v_arr = var_arrays.get("v_current")

        for k, d_m in enumerate(depth_levels_m):
            pts = []
            for i, la in enumerate(lats):
                for j, lo in enumerate(lons):
                    tv = float(t_arr[k, i, j]) if (t_arr is not None and np.isfinite(t_arr[k, i, j])) else None
                    sv = float(s_arr[k, i, j]) if (s_arr is not None and np.isfinite(s_arr[k, i, j])) else None
                    uv = float(u_arr[k, i, j]) if (u_arr is not None and np.isfinite(u_arr[k, i, j])) else None
                    vv = float(v_arr[k, i, j]) if (v_arr is not None and np.isfinite(v_arr[k, i, j])) else None

                    if tv is not None:
                        spd = round(math.sqrt((uv or 0)**2 + (vv or 0)**2), 3) if (uv is not None or vv is not None) else None
                        pts.append({
                            "lat": round(float(la), 3),
                            "lon": round(float(lo), 3),
                            "depth_m": d_m,
                            "actual_depth_m": d_m,
                            "temperature_c": round(tv, 2),
                            "salinity_psu": round(sv, 2) if sv is not None else None,
                            "current_u_ms": round(uv, 3) if uv is not None else None,
                            "current_v_ms": round(vv, 3) if vv is not None else None,
                            "current_speed_ms": spd,
                            "source": source,
                        })

            depth_slices.append({
                "depth_m": d_m,
                "actual_depth_m": d_m,
                "n_points": len(pts),
                "source": source if pts else "no_data",
                "points": pts,
            })

        # max_depth_m: prefer the real fetched bathy max, fall back to last depth level
        max_d = bathy_max_depth if bathy_max_depth is not None else (
            round(float(depth_levels_m[-1]), 3) if depth_levels_m else 5727.917
        )

        bathy_flat = [v for r in bathy_grid for v in r if v is not None]
        distinct_bathy_vals = len(set(bathy_flat))
        bathy_shape = (len(bathy_grid), len(bathy_grid[0]) if bathy_grid else 0)
        logger.info("[BATHY TIER] source=%s distinct_values=%d" % (bathy_tier_used, distinct_bathy_vals))
        logger.info(
            f"[BATHY TIER DIAGNOSTIC] tier_used='{bathy_tier_used}', "
            f"shape={bathy_shape}, distinct_values={distinct_bathy_vals}"
        )

        return {
            "source": source,
            "date": actual_date,
            "bbox": {"lat_min": lat_min, "lat_max": lat_max, "lon_min": lon_min, "lon_max": lon_max},
            "native_depth_count": len(depth_levels_m),
            "native_depths": depth_levels_m,
            "max_depth_m": max_d,
            "bathymetry": bathy_grid,
            "bathymetry_lats": [round(float(x), 3) for x in lats],
            "bathymetry_lons": [round(float(x), 3) for x in lons],
            "variables": ["temperature", "salinity", "u_current", "v_current"],
            "layers": depth_slices,
            "depth_slices": depth_slices,
            "actual_zarr_depth_levels": depth_levels_m,
            "available_depth_max_m": max_d,
            "available_depth_min_m": round(float(depth_levels_m[0]), 3) if depth_levels_m else 0.494,
            "bathymetry_source": bathy_tier_used,
            "depth_levels_m": depth_levels_m,
            "n_zarr_depth_levels": len(depth_levels_m),
            "copernicus_full_depth_levels": COPERNICUS_FULL_50_DEPTHS,
            "copernicus_max_depth_m": COPERNICUS_FULL_50_DEPTHS[-1],
        }

    except Exception as e:
        logger.error(f"[volume-full] _read_phy_volume_full_data error: {e}")
        return {
            "source": "copernicus_standard",
            "date": date_str,
            "bbox": {"lat_min": lat_min, "lat_max": lat_max, "lon_min": lon_min, "lon_max": lon_max},
            "native_depth_count": len(COPERNICUS_FULL_50_DEPTHS),
            "native_depths": COPERNICUS_FULL_50_DEPTHS,
            "max_depth_m": COPERNICUS_FULL_50_DEPTHS[-1],
            "bathymetry": [],
            "bathymetry_lats": [],
            "bathymetry_lons": [],
            "variables": ["temperature", "salinity", "u_current", "v_current"],
            "layers": [],
            "depth_slices": [],
        }


@app.get("/ocean/volume-full")
async def ocean_volume_full(
    lat_min: float = Query(8.0,  description="South bound (Indian Ocean default: 8N)"),
    lat_max: float = Query(25.0, description="North bound (Indian Ocean default: 25N)"),
    lon_min: float = Query(60.0, description="West bound (Indian Ocean default: 60E)"),
    lon_max: float = Query(95.0, description="East bound (Indian Ocean default: 95E)"),
    date: Optional[str] = Query(None, description="ISO date YYYY-MM-DD or null for latest"),
    variable: str = Query("temperature", description="Primary scalar variable for coloring"),
):
    """
    PHASE 1/2 — FULL OCEAN MODE endpoint.

    Returns all 50 native depth levels, real 2D seafloor bathymetry grid, and 2D layers
    where land and missing cells are NaN.
    """
    _validate_spatial_bounds(lat_min, lat_max, lon_min, lon_max, allow_antimeridian=False)
    t0 = time.perf_counter()
    date_str = resolve_date_input(date)

    cache_key = f"vol_full:{lat_min:.2f}:{lat_max:.2f}:{lon_min:.2f}:{lon_max:.2f}:{date_str}:{variable}"
    cached = l1_get(cache_key)
    if cached:
        return {**cached, "cache": "L1_RAM", "elapsed_ms": round((time.perf_counter() - t0) * 1000, 2)}

    # On-demand bathymetry check: if not covered by cached bathy zarr, trigger fetch
    global bathy_dataset_xr
    if not _is_bathy_covered(lat_min, lat_max, lon_min, lon_max) and _fetcher.credentials_present():
        logger.info(f"[volume-full] Bathymetry not covered for lat=[{lat_min},{lat_max}], lon=[{lon_min},{lon_max}]. Triggering on-demand fetch...")
        try:
            fetch_task = asyncio.create_task(_fetcher.fetch_bathy_range(lat_min, lat_max, lon_min, lon_max))
            bathy_res = await asyncio.wait_for(asyncio.shield(fetch_task), timeout=6.0)
            if bathy_res.get("status") in ("success", "cached"):
                _bds = _safe_open_zarr(BATHY_ZARR_PATH)
                if _bds is not None:
                    bathy_dataset_xr = _bds
                    logger.info(f"[volume-full] Bathy fetched+loaded for lat=[{lat_min},{lat_max}], lon=[{lon_min},{lon_max}]")
        except asyncio.TimeoutError:
            logger.warning(f"[volume-full] Bathy fetch exceeded 6s for lat=[{lat_min},{lat_max}], lon=[{lon_min},{lon_max}] — continuing in background")
        except Exception as _fe:
            logger.warning(f"[volume-full] Bathy fetch error: {_fe}")

    loop = asyncio.get_event_loop()

    data_payload = await loop.run_in_executor(
        None,
        lambda: _read_phy_volume_full_data(lat_min, lat_max, lon_min, lon_max, date_str),
    )

    # On-demand physics check: if no candidate has real data, trigger fetch
    has_real_phy = bool(data_payload.get("depth_slices") and any(s.get("points") for s in data_payload.get("depth_slices", [])))
    if not has_real_phy and _fetcher.credentials_present():
        logger.info(f"[volume-full] Physics data not covered for lat=[{lat_min},{lat_max}], lon=[{lon_min},{lon_max}]. Triggering on-demand fetch...")
        try:
            eff_depth_min = _clamp_depth_min(0.0)
            eff_depth_max = 200.0
            phy_task = asyncio.create_task(
                _fetcher.fetch_phy_range(
                    lat_min, lat_max, lon_min, lon_max,
                    depth_min=eff_depth_min, depth_max=eff_depth_max,
                    date_str=date_str,
                )
            )
            def _on_phy_done(t):
                if not t.cancelled() and t.exception() is None:
                    _reload_phy_zarr()
            phy_task.add_done_callback(_on_phy_done)

            phy_res = await asyncio.wait_for(asyncio.shield(phy_task), timeout=4.0)
            if phy_res.get("status") in ("success", "cached"):
                await loop.run_in_executor(None, _reload_phy_zarr)
                data_payload = await loop.run_in_executor(
                    None,
                    lambda: _read_phy_volume_full_data(lat_min, lat_max, lon_min, lon_max, date_str),
                )
        except Exception as _pe:
            logger.warning(f"[volume-full] Phy fetch exceeded 4s, continuing in background: {_pe}")

    # Fetch Argo floats for the region (non-blocking, 2s timeout)
    raw_floats: List[Dict] = []
    try:
        floats_res = await asyncio.wait_for(
            _argo.fetch_active_floats(lat_min, lat_max, lon_min, lon_max, days=60, float_type="both"),
            timeout=2.0,
        )
        raw_floats = floats_res.get("floats", []) if isinstance(floats_res, dict) else []
    except Exception:
        pass

    real_floats = [
        f for f in raw_floats
        if f.get("platform_number") != "SYNTHETIC_BGC_MODEL"
        and f.get("source_label") != "gridded_model"
        and f.get("source") != "synthetic_model"
    ]
    enriched_floats = _enrich_floats_for_3d(real_floats, lat_min, lat_max, lon_min, lon_max)

    has_data = bool(data_payload.get("depth_slices") or data_payload.get("layers"))
    result = {
        "status": "ok" if has_data else "no_local_data",
        "mode": "full_ocean",
        "fetch_status": "cache_hit" if has_data else (
            "fetching" if _fetcher.credentials_present() else "no_credentials"
        ),
        "source": data_payload.get("source", "demo_full_depth"),
        "date": data_payload.get("date", date_str),
        "bbox": {"lat_min": lat_min, "lat_max": lat_max, "lon_min": lon_min, "lon_max": lon_max},
        "native_depth_count": data_payload.get("native_depth_count", len(COPERNICUS_FULL_50_DEPTHS)),
        "native_depths": data_payload.get("native_depths", COPERNICUS_FULL_50_DEPTHS),
        "max_depth_m": data_payload.get("max_depth_m", 5727.917),
        "bathymetry": data_payload.get("bathymetry", []),
        "bathymetry_lats": data_payload.get("bathymetry_lats", []),
        "bathymetry_lons": data_payload.get("bathymetry_lons", []),
        "bathymetry_source": data_payload.get("bathymetry_source", "none"),
        "depth_levels_m": data_payload.get("native_depths", COPERNICUS_FULL_50_DEPTHS),
        "variables": data_payload.get("variables", ["temperature", "salinity", "u_current", "v_current"]),
        "layers": data_payload.get("layers", []),
        "depth_slices": data_payload.get("depth_slices", []),
        "floats": enriched_floats,

        # Metadata for UI
        "actual_zarr_depth_levels": data_payload.get("native_depths", COPERNICUS_FULL_50_DEPTHS),
        "available_depth_max_m": data_payload.get("max_depth_m", 5727.917),
        "available_depth_min_m": data_payload.get("available_depth_min_m", 0.494),
        "n_zarr_depth_levels": data_payload.get("native_depth_count", len(COPERNICUS_FULL_50_DEPTHS)),
        "copernicus_full_depth_levels": COPERNICUS_FULL_50_DEPTHS,
        "copernicus_max_depth_m": COPERNICUS_FULL_50_DEPTHS[-1],
        "elapsed_ms": round((time.perf_counter() - t0) * 1000, 2),
    }

    res_bathy = result.get("bathymetry", [])
    res_flat = [v for r in res_bathy for v in r if v is not None]
    res_distinct = len(set(res_flat))
    res_shape = (len(res_bathy), len(res_bathy[0]) if res_bathy else 0)
    logger.info("[BATHY API RESPONSE] shape=%s distinct_values=%d" % (str(res_shape), res_distinct))

    if has_data:
        l1_set(cache_key, result)

    return result


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

    # Uvicorn resolves reload exclusions with Path.cwd().glob(), so wildcard
    # exclusions must be relative to the directory used to launch this file.
    reload_output = Path(os.path.relpath(BASE_DIR / "output", Path.cwd())).as_posix()
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        # Exclude runtime-generated data directories from watchfiles.
        # Without this, every Zarr/NC write inside backend/output/ triggers
        # a full server reload loop that kills in-flight Copernicus fetches.
        # The "watchfiles.main: changes detected" log message is watchfiles
        # noticing filesystem changes — it is NOT a Copernicus error.
        reload_excludes=[
            reload_output,
            f"{reload_output}/**",
            f"{reload_output}/user_uploads",
            "data/**",
            "data/zarr/**",
            "data/backup_cache/**",
            "cache/**",
            "logs/**",
            "*.zarr/**",
            "*.zarr",
            "*.nc",
            "*.nc.tmp",
            "*.zarr.tmp",
            "*_tmp*",
            "*_old*",
            "*.zarray",
            "*.zattrs",
            "*.zgroup",
        ],
        reload_dirs=[str(BASE_DIR)],
    )
