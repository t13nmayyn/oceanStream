/**
 * argoApi.js — Centralized API service for Core & BGC Argo Floats and Profiles
 */
import { API_BASE } from '../config/api';

/**
 * Fetch nearest Argo floats to a coordinate
 */
export async function getNearestArgoFloats(lat, lon, radiusKm = 500, type = 'both') {
  const params = new URLSearchParams({
    lat: lat.toFixed(4),
    lon: lon.toFixed(4),
    radius_km: radiusKm.toString(),
    type,
  });

  try {
    const res = await fetch(`${API_BASE}/argo/nearest?${params.toString()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('[argoApi] getNearestArgoFloats unavailable:', err.message);
    return { status: 'unavailable', floats: [] };
  }
}

/**
 * Fetch full vertical profile for an Argo float platform
 */
export async function getArgoProfile(platformNumber, date = null) {
  const params = new URLSearchParams({
    platform_number: platformNumber.toString(),
  });
  if (date) params.append('date', date);

  try {
    const res = await fetch(`${API_BASE}/argo/profile?${params.toString()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data && data.profile && data.profile.length > 0) {
      return data;
    }
    throw new Error('Empty profile from backend');
  } catch (err) {
    console.warn('[argoApi] getArgoProfile unavailable:', err.message);
    return { status: 'unavailable', platform_number: platformNumber, profile: [], message: err.message };
  }
}

/**
 * Fetch nearest underwater gliders / AODN moorings to a coordinate.
 * Calls /glider/nearest on the FastAPI backend (IOOS Glider DAC + AODN ERDDAP).
 * Returns { n_gliders, gliders: [] } — silently returns empty on failure.
 */
export async function getGlidersNearest(lat, lon, radiusKm = 500) {
  const params = new URLSearchParams({
    lat: lat.toFixed(4),
    lon: lon.toFixed(4),
    radius_km: radiusKm.toString(),
  });

  try {
    const res = await fetch(`${API_BASE}/glider/nearest?${params.toString()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('[argoApi] getGlidersNearest unavailable:', err.message);
    return { status: 'unavailable', n_gliders: 0, gliders: [] };
  }
}

/**
 * Fetch full vertical profile for an underwater glider mission.
 * Calls /glider/profile on the FastAPI backend.
 */
export async function getGliderProfile(datasetId, server = null) {
  const params = new URLSearchParams({ dataset_id: datasetId });
  if (server) params.append('server', server);

  try {
    const res = await fetch(`${API_BASE}/glider/profile?${params.toString()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('[argoApi] getGliderProfile unavailable:', err.message);
    return { status: 'unavailable', dataset_id: datasetId, profile: [] };
  }
}

/**
 * Fetch global active Argo floats list
 */
export async function getActiveArgoFloats(limit = 100) {
  try {
    const res = await fetch(`${API_BASE}/api/argo-floats?limit=${limit}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('[argoApi] getActiveArgoFloats fallback:', err.message);
    return [];
  }
}
