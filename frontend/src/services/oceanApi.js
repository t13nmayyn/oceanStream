/**
 * oceanApi.js — Centralized API service for Copernicus Ocean Physics & BGC data
 */
import { API_BASE, NODE_API_BASE } from '../config/api';

/**
 * Fetch point data (Physics + BGC + Nearest Argo).
 * Routes through the Node/Express gateway for validation and forwarding.
 * Does NOT return mock/fallback values — throws on any failure so the
 * caller (PointQueryPanel) can show a real error state.
 *
 * @param {number} lat - Latitude (-90 to 90)
 * @param {number} lon - Longitude (-180 to 180)
 * @param {number} depth - Depth in meters (default 0)
 * @param {string|null} date - ISO Date YYYY-MM-DD, or null for latest available
 * @throws {Error} on network failure, gateway error, or non-2xx response
 */
export async function getOceanPoint(lat, lon, depth = 0, date = null) {
  const params = new URLSearchParams({
    lat: lat.toFixed(6),
    lon: lon.toFixed(6),
    depth: depth.toString(),
  });
  if (date) params.append('date', date);

  const res = await fetch(`${NODE_API_BASE}/api/ocean/point?${params.toString()}`);

  if (!res.ok) {
    // Surface the gateway or upstream error message
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.details ?? body.error ?? detail;
    } catch { /* ignore JSON parse failure */ }
    throw new Error(`[ocean/point] HTTP ${res.status}: ${detail}`);
  }

  return res.json();
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
 * Fetch 3D multi-depth volume grid slices across 0, 10, 50, 100, 200, 500, 1000m
 */
export async function getOceanVolume(bounds, depths = '0,10,50,100,200,500,1000', date = null, variable = 'temperature') {
  const south = Number(bounds.south ?? bounds.lat_min ?? 8);
  const north = Number(bounds.north ?? bounds.lat_max ?? 20);
  const west = Number(bounds.west ?? bounds.lon_min ?? 71);
  const east = Number(bounds.east ?? bounds.lon_max ?? 88);

  const params = new URLSearchParams({
    lat_min: south.toFixed(2),
    lat_max: north.toFixed(2),
    lon_min: west.toFixed(2),
    lon_max: east.toFixed(2),
    depths,
    variable,
  });
  if (date) params.append('date', date);

  try {
    const res = await fetch(`${API_BASE}/ocean/volume?${params.toString()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('[oceanApi] getOceanVolume error:', err.message);
    return null;
  }
}

export async function getOceanCoverage(bounds) {
  const params = new URLSearchParams({
    lat_min: bounds.south.toFixed(2),
    lat_max: bounds.north.toFixed(2),
    lon_min: bounds.west.toFixed(2),
    lon_max: bounds.east.toFixed(2),
  });
  const res = await fetch(`${API_BASE}/ocean/coverage?${params.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
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
    return { status: 'unavailable', coordinates: { lat, lon, depth }, timeline: null };
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

/**
 * Upload an offline ocean dataset (.nc, .csv)
 */
export async function uploadDatasetFile(file) {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${API_BASE}/api/upload-dataset`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    let errDetail = 'Upload failed';
    try {
      const data = await res.json();
      errDetail = data.detail || errDetail;
    } catch {}
    throw new Error(errDetail);
  }
  return res.json();
}

/**
 * List all user-uploaded datasets
 */
export async function getUploadedDatasets() {
  const res = await fetch(`${API_BASE}/api/datasets`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.datasets || [];
}

/**
 * Get spatial grid snapshot from an uploaded dataset
 */
export async function getUploadedDatasetSnapshot(datasetId, variable = '', depth = 0) {
  const params = new URLSearchParams();
  if (variable) params.append('variable', variable);
  if (depth !== undefined) params.append('depth', depth.toString());

  const res = await fetch(`${API_BASE}/api/datasets/${datasetId}/snapshot?${params.toString()}`);
  if (!res.ok) {
    let errDetail = 'Failed to fetch dataset snapshot';
    try {
      const data = await res.json();
      errDetail = data.detail || errDetail;
    } catch {}
    throw new Error(errDetail);
  }
  return res.json();
}
