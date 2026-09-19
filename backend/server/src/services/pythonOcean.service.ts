/**
 * pythonOcean.service.ts
 * Thin HTTP forwarder — sends validated requests to the Python FastAPI backend
 * and returns the raw scientific JSON. No values are altered in transit.
 */

import { OceanPointQuery, OceanPointResponse } from '../types/ocean.types';

const PYTHON_API_URL = process.env.PYTHON_API_URL ?? 'http://127.0.0.1:8000';
const UPSTREAM_TIMEOUT_MS = parseInt(process.env.UPSTREAM_TIMEOUT_MS ?? '10000', 10);

/**
 * Forward a validated point query to the Python /ocean/point endpoint.
 * Throws on network failure or non-2xx HTTP status.
 */
export async function fetchOceanPoint(query: OceanPointQuery): Promise<OceanPointResponse> {
  const params = new URLSearchParams({
    lat: query.lat.toFixed(6),
    lon: query.lon.toFixed(6),
    depth: query.depth.toString(),
  });

  if (query.date) {
    params.set('date', query.date);
  }

  const url = `${PYTHON_API_URL}/ocean/point?${params.toString()}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) {
      let body: string;
      try {
        body = await res.text();
      } catch {
        body = res.statusText;
      }
      throw new UpstreamError(
        `Python backend responded ${res.status}: ${body}`,
        res.status,
      );
    }

    return (await res.json()) as OceanPointResponse;
  } catch (err) {
    clearTimeout(timer);
    if ((err as Error).name === 'AbortError') {
      throw new UpstreamError(
        `Python backend did not respond within ${UPSTREAM_TIMEOUT_MS}ms`,
        504,
      );
    }
    throw err;
  }
}

export interface NearestArgoQuery {
  lat: number;
  lon: number;
  radius_km?: number;
  type?: 'core' | 'bgc' | 'both';
  date?: string;
}

export interface NearestArgoResponse {
  status: string;
  query: Record<string, unknown>;
  n_floats: number;
  floats: Array<{
    platform_number: string;
    lat: number;
    lon: number;
    distance_km: number;
    type?: string;
    available_variables?: string[];
    last_date?: string;
    source?: string;
    [key: string]: unknown;
  }>;
  elapsed_ms?: number;
}

/**
 * Forward nearest Argo query to Python /argo/nearest endpoint.
 */
export async function fetchNearestArgoFloats(query: NearestArgoQuery): Promise<NearestArgoResponse> {
  const params = new URLSearchParams({
    lat: query.lat.toFixed(6),
    lon: query.lon.toFixed(6),
    radius_km: (query.radius_km ?? 300).toString(),
    type: query.type ?? 'both',
  });

  if (query.date) {
    params.set('date', query.date);
  }

  const url = `${PYTHON_API_URL}/argo/nearest?${params.toString()}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) {
      let body: string;
      try {
        body = await res.text();
      } catch {
        body = res.statusText;
      }
      throw new UpstreamError(
        `Python backend responded ${res.status}: ${body}`,
        res.status,
      );
    }

    return (await res.json()) as NearestArgoResponse;
  } catch (err) {
    clearTimeout(timer);
    if ((err as Error).name === 'AbortError') {
      throw new UpstreamError(
        `Python backend did not respond within ${UPSTREAM_TIMEOUT_MS}ms`,
        504,
      );
    }
    throw err;
  }
}

export interface ArgoProfileQuery {
  platform_number?: string;
  lat?: number;
  lon?: number;
  date?: string;
}

export interface ArgoProfileResponse {
  status: string;
  platform_number?: string;
  source?: string;
  type?: string;
  n_levels?: number;
  profile?: Array<{
    depth?: number;
    depth_m?: number;
    temperature_c?: number;
    salinity_psu?: number;
    dissolved_oxygen?: number;
    chlorophyll?: number;
    nitrate?: number;
    ph?: number;
    timestamp?: string;
    [key: string]: unknown;
  }>;
  message?: string;
  elapsed_ms?: number;
}

/**
 * Forward Argo profile query to Python /argo/profile endpoint.
 */
export async function fetchArgoProfileData(query: ArgoProfileQuery): Promise<ArgoProfileResponse> {
  const params = new URLSearchParams();
  if (query.platform_number) params.set('platform_number', query.platform_number);
  if (query.lat !== undefined && Number.isFinite(query.lat)) params.set('lat', query.lat.toFixed(6));
  if (query.lon !== undefined && Number.isFinite(query.lon)) params.set('lon', query.lon.toFixed(6));
  if (query.date) params.set('date', query.date);

  const url = `${PYTHON_API_URL}/argo/profile?${params.toString()}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) {
      let body: string;
      try {
        body = await res.text();
      } catch {
        body = res.statusText;
      }
      throw new UpstreamError(
        `Python backend responded ${res.status}: ${body}`,
        res.status,
      );
    }

    return (await res.json()) as ArgoProfileResponse;
  } catch (err) {
    clearTimeout(timer);
    if ((err as Error).name === 'AbortError') {
      throw new UpstreamError(
        `Python backend did not respond within ${UPSTREAM_TIMEOUT_MS}ms`,
        504,
      );
    }
    throw err;
  }
}

/** Custom error that carries the upstream HTTP status so controllers can relay it */
export class UpstreamError extends Error {
  public readonly httpStatus: number;
  constructor(message: string, httpStatus: number) {
    super(message);
    this.name = 'UpstreamError';
    this.httpStatus = httpStatus;
  }
}
