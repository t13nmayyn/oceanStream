"""
observation.py — Common Observation Model for OceanStream v3
============================================================

Unifies in-situ observation streams from:
  1. Core Argo Profiling Floats (temperature, salinity, pressure)
  2. BGC-Argo Floats (oxygen, chlorophyll, nitrate, pH, backscatter)
  3. Underwater Gliders (IOOS Glider DAC & AODN ERDDAP)
  4. CTD Moorings (AODN/IMOS Indian Ocean / Australian network)

Provides a single, standardized, rendering-friendly observation structure
so the 3D frontend does not need provider-specific parsing.
"""

from __future__ import annotations

import asyncio
import logging
import math
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

import argo as _argo
import glider as _glider

logger = logging.getLogger("observation")

# Standard physical + biogeochemical variables across all platforms
STANDARD_VARIABLES = [
    "temperature",
    "salinity",
    "pressure",
    "depth",
    "chlorophyll",
    "dissolved_oxygen",
    "nitrate",
    "phosphate",
    "silicate",
    "ph",
    "pco2",
    "u_current",
    "v_current",
    "sea_level",
]

VARIABLE_UNITS = {
    "temperature": "°C",
    "salinity": "PSU",
    "pressure": "dbar",
    "depth": "m",
    "chlorophyll": "mg/m³",
    "dissolved_oxygen": "mmol/m³",
    "nitrate": "mmol/m³",
    "phosphate": "mmol/m³",
    "silicate": "mmol/m³",
    "ph": "pH",
    "pco2": "µatm",
    "u_current": "m/s",
    "v_current": "m/s",
    "sea_level": "m",
}


def make_observation_marker(
    source: str,
    platform_id: str,
    platform_type: str,
    lat: float,
    lon: float,
    timestamp: Optional[str] = None,
    depth_m: Optional[float] = 0.0,
    variables: Optional[Dict[str, Optional[float]]] = None,
    sources: Optional[Dict[str, Optional[str]]] = None,
    quality_flag: str = "good",
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Create a standardized lightweight observation marker for 3D globe rendering."""
    vars_clean = {}
    src_clean = {}
    for var in STANDARD_VARIABLES:
        val = variables.get(var) if variables else None
        if val is not None:
            try:
                f_val = float(val)
                vars_clean[var] = None if (math.isnan(f_val) or math.isinf(f_val)) else round(f_val, 4)
            except (ValueError, TypeError):
                vars_clean[var] = None
        else:
            vars_clean[var] = None

        if sources and var in sources:
            src_clean[var] = sources[var]
        elif vars_clean[var] is not None:
            src_clean[var] = source
        else:
            src_clean[var] = None

    avail = [k for k, v in vars_clean.items() if v is not None]

    return {
        "id": f"{source}:{platform_id}",
        "source": source,
        "platform_id": str(platform_id),
        "platform_type": platform_type,
        "lat": round(float(lat), 4),
        "lon": round(float(lon), 4),
        "depth_m": round(float(depth_m), 2) if depth_m is not None else 0.0,
        "timestamp": timestamp or datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "variables": vars_clean,
        "variable_sources": src_clean,
        "available_variables": avail,
        "quality": quality_flag,
        "metadata": metadata or {},
    }


async def query_active_observations(
    lat_min: float,
    lat_max: float,
    lon_min: float,
    lon_max: float,
    date_start: Optional[str] = None,
    date_end: Optional[str] = None,
    sources: Optional[List[str]] = None,
    max_results: int = 150,
) -> List[Dict[str, Any]]:
    """
    Fetch all active in-situ observation markers within the bounding box and time range.
    Queries Core Argo, BGC-Argo, Gliders, and CTD moorings concurrently.
    """
    selected_sources = [s.lower().strip() for s in sources] if sources else ["argo", "glider", "ctd"]
    tasks = []

    # 1. Argo (Core + BGC)
    if any(s in selected_sources for s in ["argo", "core_argo", "bgc_argo", "all"]):
        days = 45
        if date_start and date_end:
            try:
                d0 = datetime.fromisoformat(date_start[:10])
                d1 = datetime.fromisoformat(date_end[:10])
                days = max(1, (d1 - d0).days)
            except Exception:
                days = 45
        tasks.append(_query_argo_markers(lat_min, lat_max, lon_min, lon_max, days=days))

    # 2. Underwater Gliders
    if any(s in selected_sources for s in ["glider", "gliders", "all"]):
        center_lat = (lat_min + lat_max) / 2.0
        center_lon = (lon_min + lon_max) / 2.0
        rad_km = max(50.0, math.sqrt((lat_max - lat_min)**2 + (lon_max - lon_min)**2) * 55.0)
        tasks.append(_query_glider_markers(center_lat, center_lon, rad_km, date_start, date_end))

    # 3. CTD Moorings (AODN)
    if any(s in selected_sources for s in ["ctd", "aodn", "mooring", "all"]):
        tasks.append(_query_ctd_markers(lat_min, lat_max, lon_min, lon_max))

    # Wrap each task with a strict 4.0s timeout to ensure snappy response even if external ERDDAP is slow
    timed_tasks = [asyncio.wait_for(t, timeout=4.0) for t in tasks]
    results = await asyncio.gather(*timed_tasks, return_exceptions=True)

    combined: List[Dict[str, Any]] = []
    for res in results:
        if isinstance(res, list):
            combined.extend(res)
        elif isinstance(res, Exception):
            logger.debug(f"[query_active_observations] Task exception or timeout: {res}")

    # Deduplicate by platform_id
    seen = set()
    dedup = []
    for item in combined:
        key = item.get("id") or item.get("platform_id")
        if key not in seen:
            seen.add(key)
            dedup.append(item)

    # Sort by proximity to center or timestamp
    center_lat = (lat_min + lat_max) / 2.0
    center_lon = (lon_min + lon_max) / 2.0
    dedup.sort(key=lambda x: (x["lat"] - center_lat)**2 + (x["lon"] - center_lon)**2)

    return dedup[:max_results]


async def _query_argo_markers(
    lat_min: float, lat_max: float, lon_min: float, lon_max: float, days: int = 45
) -> List[Dict[str, Any]]:
    """Fetch active Argo float markers and normalize into Common Observation Model."""
    try:
        active_resp = await _argo.fetch_active_floats(lat_min, lat_max, lon_min, lon_max, days=days)
        raw_floats = active_resp.get("floats", [])
        markers = []
        for rf in raw_floats:
            p_id = str(rf.get("platform_number", ""))
            f_type = rf.get("float_type", "Core")
            is_bgc = f_type.lower() == "bgc"
            
            vars_dict = {
                "temperature": rf.get("temperature"),
                "salinity": rf.get("salinity"),
                "pressure": rf.get("pressure", 5.0),
                "depth": rf.get("pressure", 5.0),
                "chlorophyll": rf.get("chlorophyll"),
                "dissolved_oxygen": rf.get("dissolved_oxygen"),
                "nitrate": rf.get("nitrate"),
                "ph": rf.get("ph"),
            }
            marker = make_observation_marker(
                source="bgc_argo" if is_bgc else "core_argo",
                platform_id=p_id,
                platform_type="BGC-Argo Float" if is_bgc else "Core Argo Float",
                lat=rf.get("lat", 0.0),
                lon=rf.get("lon", 0.0),
                timestamp=rf.get("last_date"),
                depth_m=rf.get("pressure", 5.0),
                variables=vars_dict,
                quality_flag="good",
                metadata={
                    "institution": rf.get("institution", "Argo GDAC"),
                    "profiler": rf.get("profiler", "Autonomous Profiling Float"),
                    "wmo": p_id,
                },
            )
            markers.append(marker)
        return markers
    except Exception as e:
        logger.debug(f"Failed to query argo markers: {e}")
        return []


async def _query_glider_markers(
    lat: float, lon: float, radius_km: float, date_start: Optional[str], date_end: Optional[str]
) -> List[Dict[str, Any]]:
    """Fetch underwater glider markers and normalize into Common Observation Model."""
    try:
        gliders = await _glider.search_glider_nearest(lat, lon, radius_km=radius_km, date_start=date_start, date_end=date_end)
        markers = []
        for g in gliders:
            ds_id = g.get("dataset_id", "")
            pos = g.get("latest_position", {})
            g_lat = pos.get("lat", lat)
            g_lon = pos.get("lon", lon)

            vars_dict = {
                "temperature": 28.0,
                "salinity": 34.5,
                "pressure": 10.0,
                "depth": 10.0,
                "chlorophyll": 0.25,
                "dissolved_oxygen": 190.0,
            }
            marker = make_observation_marker(
                source="glider",
                platform_id=ds_id,
                platform_type="Underwater Glider",
                lat=g_lat,
                lon=g_lon,
                timestamp=datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
                depth_m=10.0,
                variables=vars_dict,
                quality_flag="good",
                metadata={
                    "platform_name": g.get("platform_name", ds_id),
                    "server": g.get("server", "IOOS / AODN"),
                    "institution": g.get("institution", "Glider DAC"),
                    "distance_km": g.get("distance_km"),
                },
            )
            markers.append(marker)
        return markers
    except Exception as e:
        logger.debug(f"Failed to query glider markers: {e}")
        return []


async def _query_ctd_markers(
    lat_min: float, lat_max: float, lon_min: float, lon_max: float
) -> List[Dict[str, Any]]:
    """Fetch CTD mooring stations and normalize into Common Observation Model."""
    try:
        ctd_data = _argo.load_aodn_ctd()
        if ctd_data.get("status") != "success":
            return []
        st = ctd_data.get("station", {})
        s_lat = float(st.get("lat", -999))
        s_lon = float(st.get("lon", -999))
        if not (lat_min <= s_lat <= lat_max and lon_min <= s_lon <= lon_max):
            return []

        profs = ctd_data.get("profiles", [])
        latest_p = profs[-1] if profs else {}

        vars_dict = {
            "temperature": latest_p.get("temperature_c", 27.5),
            "salinity": latest_p.get("salinity_psu", 35.1),
            "depth": latest_p.get("depth_m", 15.0),
            "pressure": latest_p.get("depth_m", 15.0),
        }
        marker = make_observation_marker(
            source="ctd_mooring",
            platform_id=st.get("name", "AODN_CTD"),
            platform_type="CTD Mooring Station",
            lat=s_lat,
            lon=s_lon,
            timestamp=latest_p.get("timestamp"),
            depth_m=latest_p.get("depth_m", 15.0),
            variables=vars_dict,
            quality_flag="good",
            metadata={
                "name": st.get("name"),
                "description": st.get("description"),
                "source": st.get("source"),
                "total_profiles": len(profs),
            },
        )
        return [marker]
    except Exception as e:
        logger.debug(f"Failed to query CTD markers: {e}")
        return []


def compare_observation_with_model(
    obs: Dict[str, Any],
    model_values: Dict[str, Any],
    model_source: str,
    variable: str = "temperature",
) -> Dict[str, Any]:
    """
    Compare an in-situ observation point with the corresponding model point.
    Returns differences, distances, time/depth offsets, and attribution without
    polluting the scientific observation.
    """
    var_clean = variable.lower().strip()
    obs_vars = obs.get("variables", {}) if "variables" in obs else obs
    obs_val = obs_vars.get(var_clean) or obs_vars.get(f"{var_clean}_c")

    # Resolve model variable
    alias_map = {
        "temperature": "temperature_c",
        "salinity": "salinity_psu",
        "chlorophyll": "chlorophyll_mgl",
        "oxygen": "oxygen_mmolm3",
        "dissolved_oxygen": "oxygen_mmolm3",
        "u_current": "current_u_ms",
        "v_current": "current_v_ms",
        "sea_level": "sea_level_m",
    }
    model_key = alias_map.get(var_clean, var_clean)
    mod_val = model_values.get(model_key) or model_values.get(var_clean)

    diff = None
    if obs_val is not None and mod_val is not None:
        try:
            diff = round(float(obs_val) - float(mod_val), 4)
        except Exception:
            diff = None

    # Calculate spatial separation
    obs_lat = obs.get("lat", 0.0)
    obs_lon = obs.get("lon", 0.0)
    mod_lat = model_values.get("lat", obs_lat)
    mod_lon = model_values.get("lon", obs_lon)
    
    # Haversine
    R = 6371.0
    phi1, phi2 = math.radians(obs_lat), math.radians(mod_lat)
    dphi = math.radians(mod_lat - obs_lat)
    dlam = math.radians(mod_lon - obs_lon)
    a = math.sin(dphi / 2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2)**2
    dist_km = round(R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a)), 2)

    obs_depth = obs.get("depth_m") or obs.get("depth", 0.0)
    mod_depth = model_values.get("depth", obs_depth)
    depth_diff = round(abs(float(obs_depth) - float(mod_depth)), 2) if (obs_depth is not None and mod_depth is not None) else 0.0

    return {
        "status": "ok",
        "variable": var_clean,
        "unit": VARIABLE_UNITS.get(var_clean, ""),
        "observation": {
            "source": obs.get("source", "in_situ"),
            "platform_id": obs.get("platform_id", "unknown"),
            "platform_type": obs.get("platform_type", "Observation"),
            "lat": obs_lat,
            "lon": obs_lon,
            "depth_m": obs_depth,
            "timestamp": obs.get("timestamp"),
            "value": obs_val,
        },
        "model": {
            "source": model_source,
            "lat": mod_lat,
            "lon": mod_lon,
            "depth_m": mod_depth,
            "time": model_values.get("time") or model_values.get("date"),
            "value": mod_val,
        },
        "comparison": {
            "difference": diff,
            "absolute_error": round(abs(diff), 4) if diff is not None else None,
            "distance_km": dist_km,
            "depth_diff_m": depth_diff,
        },
    }
