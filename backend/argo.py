"""
argo.py — Argo Core, BGC-Argo, and AODN CTD data access
=========================================================

Three data sources, all queryable by nearest-float-to-a-clicked-point:

  1. Core Argo  — temperature + salinity profiles (local Zarr first, live argopy fallback)
  2. BGC-Argo   — oxygen, nitrate, chlorophyll, pH from biogeochemical floats
  3. AODN CTD   — mooring time-series from the AODN/IMOS network (local NetCDF)

All functions return plain dicts suitable for JSON serialisation.
"""

from __future__ import annotations

import asyncio
import json
import logging
import math
import os
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import xarray as xr

logger = logging.getLogger("argo")

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
_BASE_DIR   = Path(__file__).resolve().parent
_OUTPUT_DIR = _BASE_DIR / "output"
_ROOT_DIR   = _BASE_DIR.parent
AODN_DIR    = _ROOT_DIR / "aodn_output"
AODN_NC     = AODN_DIR  / "aodn_subset.nc"
AODN_META   = AODN_DIR  / "aodn_meta.json"
ARGO_ZARR   = _OUTPUT_DIR / "argo_data.zarr"


# ---------------------------------------------------------------------------
# Haversine distance (km)
# ---------------------------------------------------------------------------

def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _safe_float(v) -> Optional[float]:
    try:
        f = float(v)
        return None if (math.isnan(f) or math.isinf(f)) else round(f, 4)
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Time window helpers
# ---------------------------------------------------------------------------

def _time_window(date_str: Optional[str], pad_days: int = 30):
    """Return (t0, t1) ISO strings bracketing date_str ± pad_days."""
    try:
        dt = datetime.strptime(date_str[:10], "%Y-%m-%d") if date_str else datetime.utcnow()
    except Exception:
        dt = datetime.utcnow()
    t0 = (dt - timedelta(days=pad_days)).strftime("%Y-%m-%d")
    t1 = (dt + timedelta(days=pad_days)).strftime("%Y-%m-%d")
    return t0, t1


# ---------------------------------------------------------------------------
# Local Zarr Cache Loader
# ---------------------------------------------------------------------------

_local_argo_ds: Optional[xr.Dataset] = None

def _get_local_argo() -> Optional[xr.Dataset]:
    global _local_argo_ds
    if _local_argo_ds is not None:
        return _local_argo_ds
    if ARGO_ZARR.exists():
        try:
            _local_argo_ds = xr.open_zarr(ARGO_ZARR)
            return _local_argo_ds
        except Exception as e:
            logger.warning(f"Could not open local argo_data.zarr: {e}")
    return None


def _search_local_argo_nearest(
    lat: float,
    lon: float,
    radius_km: float = 200.0,
    max_floats: int = 10,
) -> List[Dict[str, Any]]:
    """Search local argo_data.zarr for floats near (lat, lon)."""
    ds = _get_local_argo()
    if ds is None or "LATITUDE" not in ds or "LONGITUDE" not in ds:
        return []

    lats  = ds["LATITUDE"].values
    lons  = ds["LONGITUDE"].values
    plats = ds["PLATFORM_NUMBER"].values if "PLATFORM_NUMBER" in ds else np.zeros(len(lats))
    times = ds["TIME"].values            if "TIME" in ds            else np.empty(len(lats), dtype="O")

    seen: Dict[Any, Dict] = {}
    for i in range(len(lats)):
        d = _haversine_km(lat, lon, float(lats[i]), float(lons[i]))
        if d > radius_km:
            continue
        pn = str(plats[i]).strip()
        if pn not in seen or d < seen[pn]["distance_km"]:
            seen[pn] = {
                "platform_number": pn,
                "lat": round(float(lats[i]), 4),
                "lon": round(float(lons[i]), 4),
                "distance_km": round(d, 2),
                "type": "core",
                "available_variables": ["temperature", "salinity"],
                "last_date": str(times[i])[:10] if i < len(times) else None,
                "source": "local_zarr",
            }

    return sorted(seen.values(), key=lambda x: x["distance_km"])[:max_floats]


def _extract_local_argo_profile(platform_number: str) -> Optional[Dict[str, Any]]:
    """Extract profile for platform_number from local argo_data.zarr."""
    ds = _get_local_argo()
    if ds is None or "PLATFORM_NUMBER" not in ds:
        return None

    plats = ds["PLATFORM_NUMBER"].values
    target_p = platform_number.strip()
    idx = [i for i, p in enumerate(plats) if str(p).strip() == target_p]
    if not idx:
        return None

    pres  = ds["PRES"].values if "PRES" in ds else []
    temps = ds["TEMP"].values if "TEMP" in ds else []
    psals = ds["PSAL"].values if "PSAL" in ds else []
    times = ds["TIME"].values if "TIME" in ds else []
    lats  = ds["LATITUDE"].values
    lons  = ds["LONGITUDE"].values

    profile = []
    for i in idx:
        depth_val = _safe_float(pres[i]) if i < len(pres) else None
        temp_val = _safe_float(temps[i]) if i < len(temps) else None
        psal_val = _safe_float(psals[i]) if i < len(psals) else None

        profile.append({
            "depth":            depth_val,
            "depth_m":          depth_val,
            "depth_dbar":       depth_val,
            "temperature":      temp_val,
            "temperature_c":    temp_val,
            "salinity":         psal_val,
            "salinity_psu":     psal_val,
            "oxygen_mmolm3":    None,
            "chlorophyll_mgl":  None,
            "nitrate_mmolm3":   None,
            "ph":               None,
            "timestamp":        str(times[i])[:19] if i < len(times) else None,
            "lat":              _safe_float(lats[i]) if i < len(lats) else None,
            "lon":              _safe_float(lons[i]) if i < len(lons) else None,
        })

    profile.sort(key=lambda r: r["depth_m"] if r["depth_m"] is not None else 9999)

    return {
        "status": "success",
        "platform_number": target_p,
        "type": "core",
        "source": "local_zarr",
        "n_levels": len(profile),
        "profile": profile,
    }


# ---------------------------------------------------------------------------
# 1. Core Argo — temperature + salinity
# ---------------------------------------------------------------------------

async def fetch_core_argo_nearest(
    lat: float,
    lon: float,
    radius_km: float = 200.0,
    date_str: Optional[str] = None,
    max_floats: int = 10,
) -> List[Dict[str, Any]]:
    """
    Find Core Argo floats within radius_km of (lat, lon).
    Returns local zarr matches first, falls back to argopy if needed.
    """
    # 1. Check local zarr store
    local_floats = _search_local_argo_nearest(lat, lon, radius_km, max_floats)
    if local_floats:
        return local_floats

    # 2. If nothing local, try live argopy fetch with a strict 5s timeout
    bbox_deg = radius_km / 111.0
    lat_min, lat_max = lat - bbox_deg, lat + bbox_deg
    lon_min, lon_max = lon - bbox_deg, lon + bbox_deg
    t0, t1 = _time_window(date_str, pad_days=45)

    try:
        import argopy
        loop = asyncio.get_event_loop()
        ds = await asyncio.wait_for(
            loop.run_in_executor(
                None,
                lambda: (
                    argopy.DataFetcher(mode="standard")
                    .region([lon_min, lon_max, lat_min, lat_max, 0, 10, t0, t1])
                    .to_xarray()
                ),
            ),
            timeout=5.0,
        )
    except Exception as e:
        logger.debug(f"[CoreArgo] Live fetch failed or timed out: {e}")
        return []

    if ds is None or ds.sizes.get("N_POINTS", 0) == 0:
        return []

    lats  = ds["LATITUDE"].values
    lons  = ds["LONGITUDE"].values
    plats = ds["PLATFORM_NUMBER"].values if "PLATFORM_NUMBER" in ds else np.zeros(len(lats))
    times = ds["TIME"].values            if "TIME" in ds            else np.empty(len(lats), dtype="O")

    seen: Dict[Any, Dict] = {}
    for i in range(len(lats)):
        d = _haversine_km(lat, lon, float(lats[i]), float(lons[i]))
        if d > radius_km:
            continue
        pn = str(plats[i]).strip()
        if pn not in seen or d < seen[pn]["distance_km"]:
            seen[pn] = {
                "platform_number": pn,
                "lat": round(float(lats[i]), 4),
                "lon": round(float(lons[i]), 4),
                "distance_km": round(d, 2),
                "type": "core",
                "available_variables": ["temperature", "salinity"],
                "last_date": str(times[i])[:10] if i < len(times) else None,
                "source": "live_argopy",
            }

    return sorted(seen.values(), key=lambda x: x["distance_km"])[:max_floats]


# ---------------------------------------------------------------------------
# 2. BGC-Argo — oxygen, nitrate, chlorophyll, pH
# ---------------------------------------------------------------------------

async def fetch_bgc_argo_nearest(
    lat: float,
    lon: float,
    radius_km: float = 200.0,
    date_str: Optional[str] = None,
    max_floats: int = 10,
) -> List[Dict[str, Any]]:
    """
    Find BGC-Argo floats within radius_km.
    Falls back to Copernicus In-Situ TAC search if argopy BGC fails.
    """
    bbox_deg = radius_km / 111.0
    lat_min, lat_max = lat - bbox_deg, lat + bbox_deg
    lon_min, lon_max = lon - bbox_deg, lon + bbox_deg
    t0, t1 = _time_window(date_str, pad_days=60)

    try:
        import argopy
        loop = asyncio.get_event_loop()
        ds = await asyncio.wait_for(
            loop.run_in_executor(
                None,
                lambda: (
                    argopy.DataFetcher(mode="expert")
                    .region([lon_min, lon_max, lat_min, lat_max, 0, 10, t0, t1])
                    .to_xarray()
                ),
            ),
            timeout=5.0,
        )
    except Exception as e:
        logger.debug(f"[BGCArgo] Live fetch failed or timed out: {e}")
        return _bgc_argo_from_insitu_tac(lat, lon, radius_km)

    if ds is None or ds.sizes.get("N_POINTS", 0) == 0:
        return _bgc_argo_from_insitu_tac(lat, lon, radius_km)

    bgc_vars = [v for v in ["DOXY", "NITRATE", "CHLA", "PH_IN_SITU_TOTAL", "BBP700"] if v in ds]
    var_names_human = {
        "DOXY": "oxygen", "NITRATE": "nitrate", "CHLA": "chlorophyll",
        "PH_IN_SITU_TOTAL": "ph", "BBP700": "backscatter",
    }

    lats  = ds["LATITUDE"].values
    lons  = ds["LONGITUDE"].values
    plats = ds["PLATFORM_NUMBER"].values if "PLATFORM_NUMBER" in ds else np.zeros(len(lats))
    times = ds["TIME"].values            if "TIME" in ds            else np.empty(len(lats), dtype="O")

    seen: Dict[Any, Dict] = {}
    for i in range(len(lats)):
        d = _haversine_km(lat, lon, float(lats[i]), float(lons[i]))
        if d > radius_km:
            continue
        pn = str(plats[i]).strip()
        avail = [var_names_human.get(v, v) for v in bgc_vars]
        if pn not in seen or d < seen[pn]["distance_km"]:
            seen[pn] = {
                "platform_number": pn,
                "lat": round(float(lats[i]), 4),
                "lon": round(float(lons[i]), 4),
                "distance_km": round(d, 2),
                "type": "bgc",
                "available_variables": avail if avail else ["oxygen"],
                "last_date": str(times[i])[:10] if i < len(times) else None,
            }

    return sorted(seen.values(), key=lambda x: x["distance_km"])[:max_floats]


def _bgc_argo_from_insitu_tac(lat: float, lon: float, radius_km: float) -> List[Dict]:
    """Fallback: query Copernicus In-Situ TAC ERDDAP for BGC-Argo floats."""
    try:
        import requests
        bbox_deg = radius_km / 111.0
        url = (
            "https://erddap.emso.eu/erddap/tabledap/ArgoFloats-index.json?"
            f"latitude%2Clongitude%2Cplatform_number%2Cdate%2Cparameters"
            f"&latitude>={lat - bbox_deg}&latitude<={lat + bbox_deg}"
            f"&longitude>={lon - bbox_deg}&longitude<={lon + bbox_deg}"
            f"&parameters=%22DOXY%22&orderByMax(%22date%22)"
        )
        resp = requests.get(url, timeout=4)
        resp.raise_for_status()
        data = resp.json()
        rows = data.get("table", {}).get("rows", [])
        result = []
        for row in rows[:10]:
            try:
                rlat, rlon = float(row[0]), float(row[1])
                d = _haversine_km(lat, lon, rlat, rlon)
                if d <= radius_km:
                    result.append({
                        "platform_number": str(row[2]),
                        "lat": round(rlat, 4),
                        "lon": round(rlon, 4),
                        "distance_km": round(d, 2),
                        "type": "bgc",
                        "available_variables": ["oxygen"],
                        "last_date": str(row[3])[:10] if row[3] else None,
                    })
            except Exception:
                continue
        return sorted(result, key=lambda x: x["distance_km"])
    except Exception as e:
        logger.debug(f"[BGCArgo TAC fallback] {e}")
        return []


# ---------------------------------------------------------------------------
# 3. Combined nearest float search
# ---------------------------------------------------------------------------

async def find_nearest_floats(
    lat: float,
    lon: float,
    radius_km: float = 500.0,
    float_type: str = "both",   # "core" | "bgc" | "both"
    date_str: Optional[str] = None,
    max_floats: int = 10,
) -> List[Dict[str, Any]]:
    """Return merged + deduplicated list of floats near (lat, lon)."""
    # Try local search first for instant response
    local_floats = _search_local_argo_nearest(lat, lon, radius_km, max_floats)
    if local_floats:
        return local_floats

    tasks = []
    if float_type in ("core", "both"):
        tasks.append(fetch_core_argo_nearest(lat, lon, radius_km, date_str, max_floats))
    if float_type in ("bgc", "both"):
        tasks.append(fetch_bgc_argo_nearest(lat, lon, radius_km, date_str, max_floats))

    results = await asyncio.gather(*tasks, return_exceptions=True)
    combined: Dict[str, Dict] = {}
    for res in results:
        if isinstance(res, Exception):
            continue
        for f in res:
            pn = f["platform_number"]
            if pn not in combined or f["distance_km"] < combined[pn]["distance_km"]:
                combined[pn] = f

    return sorted(combined.values(), key=lambda x: x["distance_km"])[:max_floats]


async def get_nearest_float_summary(
    lat: float, lon: float, radius_km: float = 600.0, date_str: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """Return the single closest float (for embedding in /ocean/point response)."""
    floats = await find_nearest_floats(lat, lon, radius_km, "both", date_str, max_floats=1)
    return floats[0] if floats else None


# ---------------------------------------------------------------------------
# 4. Argo profile fetch (Core + BGC fields)
# ---------------------------------------------------------------------------

async def fetch_argo_profile(
    platform_number: Optional[str] = None,
    date_str: Optional[str] = None,
    lat: Optional[float] = None,
    lon: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Fetch a depth-ordered profile for a platform number OR nearest to (lat, lon).
    Returns all available variables: depth, temperature, salinity,
    oxygen, chlorophyll, nitrate, pH, timestamp.
    """
    # If platform_number not given, find nearest platform to lat/lon
    if not platform_number:
        if lat is not None and lon is not None:
            near = await find_nearest_floats(lat, lon, radius_km=1000.0, max_floats=1)
            if near:
                platform_number = near[0]["platform_number"]
            else:
                # Try AODN CTD if within range
                aodn = nearest_aodn_ctd(lat, lon, radius_km=2000.0)
                if aodn:
                    aodn_data = load_aodn_ctd()
                    return {
                        "status": "success",
                        "platform_number": aodn["name"],
                        "source": "aodn_ctd",
                        "type": "ctd_mooring",
                        "n_levels": aodn_data.get("n_points", 0),
                        "profile": [
                            {
                                "depth": p.get("depth_m"),
                                "depth_m": p.get("depth_m"),
                                "temperature": p.get("temperature_c"),
                                "temperature_c": p.get("temperature_c"),
                                "salinity": p.get("salinity_psu"),
                                "salinity_psu": p.get("salinity_psu"),
                                "timestamp": p.get("timestamp"),
                            }
                            for p in aodn_data.get("profiles", [])[:200]
                        ],
                    }
        if not platform_number:
            return {"status": "not_found", "message": "No platform number or coordinates provided", "profile": []}

    # 1. Try extracting from local Zarr store
    local_prof = _extract_local_argo_profile(platform_number)
    if local_prof:
        return local_prof

    # 2. Try live argopy fetch with timeout
    try:
        import argopy
        loop = asyncio.get_event_loop()
        ds = await asyncio.wait_for(
            loop.run_in_executor(
                None,
                lambda: (
                    argopy.DataFetcher(mode="expert")
                    .profile(int(platform_number), "*")
                    .to_xarray()
                ),
            ),
            timeout=6.0,
        )
    except Exception as e:
        logger.debug(f"[Profile] argopy expert failed for {platform_number}: {e}")
        try:
            import argopy
            loop = asyncio.get_event_loop()
            ds = await asyncio.wait_for(
                loop.run_in_executor(
                    None,
                    lambda: (
                        argopy.DataFetcher(mode="standard")
                        .profile(int(platform_number), "*")
                        .to_xarray()
                    ),
                ),
                timeout=5.0,
            )
        except Exception as e2:
            logger.debug(f"[Profile] standard mode failed for {platform_number}: {e2}")
            return {"status": "not_found", "platform_number": platform_number, "profile": []}

    if ds is None or ds.sizes.get("N_POINTS", 0) == 0:
        return {"status": "not_found", "platform_number": platform_number, "profile": []}

    pres   = ds["PRES"].values   if "PRES"   in ds else np.array([])
    temps  = ds["TEMP"].values   if "TEMP"   in ds else np.array([])
    psals  = ds["PSAL"].values   if "PSAL"   in ds else np.array([])
    times  = ds["TIME"].values   if "TIME"   in ds else np.array([])
    lats   = ds["LATITUDE"].values  if "LATITUDE"  in ds else np.array([])
    lons   = ds["LONGITUDE"].values if "LONGITUDE" in ds else np.array([])

    doxy   = ds["DOXY"].values               if "DOXY"               in ds else np.full(len(pres), np.nan)
    chla   = ds["CHLA"].values               if "CHLA"               in ds else np.full(len(pres), np.nan)
    no3    = ds["NITRATE"].values            if "NITRATE"            in ds else np.full(len(pres), np.nan)
    ph     = ds["PH_IN_SITU_TOTAL"].values   if "PH_IN_SITU_TOTAL"  in ds else np.full(len(pres), np.nan)

    n = min(len(pres), 2000)
    profile = []
    for i in range(n):
        depth_val = _safe_float(pres[i]) if i < len(pres) else None
        temp_val = _safe_float(temps[i]) if i < len(temps) else None
        psal_val = _safe_float(psals[i]) if i < len(psals) else None

        profile.append({
            "depth":            depth_val,
            "depth_m":          depth_val,
            "depth_dbar":       depth_val,
            "temperature":      temp_val,
            "temperature_c":    temp_val,
            "salinity":         psal_val,
            "salinity_psu":     psal_val,
            "oxygen_mmolm3":    _safe_float(doxy[i])  if i < len(doxy)  else None,
            "chlorophyll_mgl":  _safe_float(chla[i])  if i < len(chla)  else None,
            "nitrate_mmolm3":   _safe_float(no3[i])   if i < len(no3)   else None,
            "ph":               _safe_float(ph[i])    if i < len(ph)    else None,
            "timestamp":        str(times[i])[:19]    if i < len(times) else None,
            "lat":              _safe_float(lats[i])  if i < len(lats)  else None,
            "lon":              _safe_float(lons[i])  if i < len(lons)  else None,
        })

    profile.sort(key=lambda r: r["depth_m"] if r["depth_m"] is not None else 9999)

    has_bgc = any(
        r["oxygen_mmolm3"] is not None or r["chlorophyll_mgl"] is not None
        for r in profile
    )

    return {
        "status": "success",
        "platform_number": platform_number,
        "type": "bgc" if has_bgc else "core",
        "source": "live_argopy",
        "n_levels": len(profile),
        "profile": profile,
    }


# ---------------------------------------------------------------------------
# 5. AODN CTD mooring data
# ---------------------------------------------------------------------------

_aodn_cache: Optional[Dict] = None

def load_aodn_ctd() -> Dict[str, Any]:
    """Load AODN CTD NetCDF into memory (cached after first call)."""
    global _aodn_cache
    if _aodn_cache is not None:
        return _aodn_cache

    if not AODN_NC.exists():
        return {"status": "not_available", "stations": [], "profiles": []}

    try:
        import xarray as xr

        meta = {}
        if AODN_META.exists():
            with open(AODN_META) as f:
                meta = json.load(f)

        ds = xr.open_dataset(str(AODN_NC))
        station = {
            "name":        meta.get("name", "PIL100"),
            "lat":         float(meta.get("lat", -19.25)),
            "lon":         float(meta.get("lon", 147.05)),
            "description": meta.get("description", "IMOS ANMN-QLD CTD mooring"),
            "source":      meta.get("source", "AODN/IMOS"),
        }

        temps  = ds["TEMP"].values.ravel()   if "TEMP"  in ds else np.array([])
        psals  = ds["PSAL"].values.ravel()   if "PSAL"  in ds else np.array([])
        depths = ds["DEPTH"].values.ravel()  if "DEPTH" in ds else np.array([])
        pres   = ds["PRES_REL"].values.ravel() if "PRES_REL" in ds else np.array([])
        times  = ds["TIME"].values           if "TIME"  in ds else np.array([])

        use_depth = depths if len(depths) > 0 else pres
        n = min(len(temps), 5000)
        profiles = []
        for i in range(n):
            depth_val = _safe_float(use_depth[i]) if i < len(use_depth) else None
            temp_val = _safe_float(temps[i]) if i < len(temps) else None
            psal_val = _safe_float(psals[i]) if i < len(psals) else None

            profiles.append({
                "depth":        depth_val,
                "depth_m":      depth_val,
                "temperature":  temp_val,
                "temperature_c": temp_val,
                "salinity":     psal_val,
                "salinity_psu":  psal_val,
                "timestamp":    str(times[i])[:19] if i < len(times) else None,
            })
        profiles.sort(key=lambda r: r["depth_m"] if r["depth_m"] is not None else 9999)
        ds.close()

        _aodn_cache = {
            "status":   "success",
            "station":  station,
            "n_points": n,
            "profiles": profiles,
        }
        return _aodn_cache

    except Exception as e:
        logger.error(f"[AODN] Load failed: {e}")
        return {"status": "error", "error": str(e), "stations": [], "profiles": []}


def nearest_aodn_ctd(lat: float, lon: float, radius_km: float = 1000.0) -> Optional[Dict]:
    """Return AODN station info if it falls within radius_km of (lat, lon)."""
    data = load_aodn_ctd()
    if data.get("status") != "success":
        return None
    st = data["station"]
    d = _haversine_km(lat, lon, st["lat"], st["lon"])
    if d > radius_km:
        return None
    return {
        "name":        st["name"],
        "description": st["description"],
        "lat":         st["lat"],
        "lon":         st["lon"],
        "distance_km": round(d, 2),
        "source":      st["source"],
        "n_points":    data["n_points"],
        "type":        "ctd_mooring",
    }
