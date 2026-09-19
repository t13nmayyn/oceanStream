/**
 * ocean.types.ts
 * Shared TypeScript types for the ocean gateway.
 * These mirror the Python backend's JSON response shapes exactly —
 * no scientific values are modified in transit.
 */

/** Validated, parsed query parameters from the incoming request */
export interface OceanPointQuery {
  lat: number;
  lon: number;
  depth: number;
  date?: string;
}

/** Physics sub-object returned by /ocean/point */
export interface OceanPhysics {
  temperature_c?: number;
  salinity_psu?: number;
  current_u_ms?: number;
  current_v_ms?: number;
  sea_level_m?: number;
  [key: string]: number | undefined;
}

/** Biogeochemistry sub-object returned by /ocean/point */
export interface OceanBgc {
  chlorophyll_mgl?: number;
  oxygen_mmolm3?: number;
  nitrate_mmolm3?: number;
  ph?: number;
  pco2_uatm?: number;
  [key: string]: number | undefined;
}

/** Nearest Argo float summary */
export interface NearestArgoFloat {
  platform_number: string;
  lat: number;
  lon: number;
  distance_km: number;
  type?: string;
  depth?: string;
  sensors?: string[];
}

/** Top-level response from /ocean/point */
export interface OceanPointResponse {
  status: string;
  lat: number;
  lon: number;
  depth: number;
  date?: string;
  cache?: string;
  physics?: OceanPhysics;
  bgc?: OceanBgc;
  nearest_argo_float?: NearestArgoFloat;
  dataset_info?: Record<string, string>;
  message?: string;
}

/** Standard gateway error envelope */
export interface GatewayError {
  error: string;
  details?: string;
}
