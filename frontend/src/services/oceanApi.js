/**
 * oceanApi.js — Centralized API service for Copernicus Ocean Physics & BGC data
 */
import { API_BASE } from '../config/api';

/**
 * Fetch point data (Physics + BGC + Nearest Argo)
 * @param {number} lat - Latitude (-90 to 90)
 * @param {number} lon - Longitude (-180 to 180)
 * @param {number} depth - Depth in meters (default 0)
 * @param {string} date - ISO Date YYYY-MM-DD
 */
export async function getOceanPoint(lat, lon, depth = 0, date = null) {
  const params = new URLSearchParams({
    lat: lat.toFixed(4),
    lon: lon.toFixed(4),
    depth: depth.toString(),
  });
  if (date) params.append('date', date);

  try {
    const res = await fetch(`${API_BASE}/ocean/point?${params.toString()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    return await res.json();
  } catch (err) {
    console.warn('[oceanApi] getOceanPoint fallback/error:', err.message);
    return {
      status: 'error',
      message: err.message,
      lat,
      lon,
      depth,
      physics: { temperature_c: 26.5, salinity_psu: 34.8, current_u_ms: 0.12, current_v_ms: -0.05, sea_level_m: 0.42 },
      bgc: { chlorophyll_mgl: 0.35, oxygen_mmolm3: 210.0, nitrate_mmolm3: 1.2, ph: 8.12, pco2_uatm: 395.0 },
      dataset_info: { phy_dataset: 'GLOBAL_ANALYSISFORECAST_PHY_001_024', source: 'Copernicus Marine ANFC' },
    };
  }
}

/**
 * Fetch bounding box 2D spatial grid snapshot
 */
export async function getOceanSnapshot(bounds, depth = 0, date = null) {
  const { south, north, west, east } = bounds;
  const params = new URLSearchParams({
    lat_min: south.toFixed(2),
    lat_max: north.toFixed(2),
    lon_min: west.toFixed(2),
    lon_max: east.toFixed(2),
    depth: depth.toString(),
  });
  if (date) params.append('date', date);

  try {
    const res = await fetch(`${API_BASE}/ocean/snapshot?${params.toString()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('[oceanApi] getOceanSnapshot error:', err.message);
    return null;
  }
}

/**
 * Fetch time series timeline for a coordinate point
 */
export async function getOceanTimeline(lat, lon, depth = 0, preset = '7d', variables = 'temperature,salinity,chlorophyll,oxygen') {
  const params = new URLSearchParams({
    lat: lat.toFixed(4),
    lon: lon.toFixed(4),
    depth: depth.toString(),
    preset,
    granularity: 'day',
    variables,
  });

  try {
    const res = await fetch(`${API_BASE}/ocean/timeline?${params.toString()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('[oceanApi] getOceanTimeline error:', err.message);
    // Generate simulated timeline curve if offline
    const days = preset === '30d' ? 30 : preset === '1y' ? 12 : 7;
    const labels = [];
    const temps = [];
    const sals = [];
    const chls = [];
    const now = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now - i * 86400000);
      labels.push(d.toISOString().slice(5, 10));
      temps.push(+(26.0 + Math.sin(i * 0.4) * 1.5 + Math.random() * 0.3).toFixed(2));
      sals.push(+(34.5 + Math.cos(i * 0.3) * 0.4).toFixed(2));
      chls.push(+(0.28 + Math.sin(i * 0.6) * 0.15).toFixed(3));
    }

    return {
      status: 'simulated',
      coordinates: { lat, lon, depth },
      timeline: { labels, temperature: temps, salinity: sals, chlorophyll: chls },
    };
  }
}

/**
 * Fetch server date information & Copernicus publication status
 */
export async function getDateInfo() {
  try {
    const res = await fetch(`${API_BASE}/api/date-info`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    return {
      status: 'offline',
      server_today: new Date().toISOString().slice(0, 10),
      copernicus_available_date: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
    };
  }
}
