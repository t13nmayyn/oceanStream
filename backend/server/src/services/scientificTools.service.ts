/**
 * scientificTools.service.ts
 * Scientific Tool Engine for OceanStream Copilot.
 * Validates inputs, executes Python scientific endpoints safely, and formats
 * structured tool results for Gemini and the frontend.
 */

import {
  fetchOceanPoint,
  fetchNearestArgoFloats,
  fetchArgoProfileData,
  UpstreamError,
} from './pythonOcean.service';
import {
  ComparisonRow,
  DepthComparisonData,
  ScientificContext,
  ToolActionRecord,
  VisualizationAction,
} from '../types/ai.types';

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

const isValidLat = (lat: unknown): lat is number =>
  isFiniteNumber(lat) && lat >= -90 && lat <= 90;

const isValidLon = (lon: unknown): lon is number =>
  isFiniteNumber(lon) && lon >= -180 && lon <= 180;

const isValidDepth = (depth: unknown): depth is number =>
  isFiniteNumber(depth) && depth >= 0 && depth <= 6000;

const isValidIsoDate = (date: unknown): date is string =>
  typeof date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(date.trim());

export interface ToolExecutionResult {
  tool: string;
  status: 'success' | 'unavailable' | 'not_found' | 'error';
  data?: Record<string, unknown>;
  reason?: string;
  summary?: string;
  comparison_data?: DepthComparisonData;
  scientific_data?: ScientificContext;
  visualization_action?: VisualizationAction;
}

/**
 * Tool 1: query_ocean_point
 * Retrieves physics + BGC + nearest Argo float at a specific coordinate, depth, and date.
 */
export async function executeQueryOceanPoint(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const { lat, lon, depth, date } = args;

  if (!isValidLat(lat) || !isValidLon(lon)) {
    return {
      tool: 'query_ocean_point',
      status: 'error',
      reason: 'Invalid coordinates: latitude must be [-90, 90] and longitude [-180, 180].',
    };
  }

  if (!isValidDepth(depth)) {
    return {
      tool: 'query_ocean_point',
      status: 'error',
      reason: 'Invalid depth: depth must be between 0 and 6000 meters.',
    };
  }

  const dateStr = typeof date === 'string' && date.trim() ? date.trim() : undefined;
  if (dateStr && !isValidIsoDate(dateStr)) {
    return {
      tool: 'query_ocean_point',
      status: 'error',
      reason: 'Invalid date format: date must be in YYYY-MM-DD format.',
    };
  }

  try {
    const res = await fetchOceanPoint({
      lat,
      lon,
      depth,
      date: dateStr,
    });

    if (res.status !== 'ok') {
      return {
        tool: 'query_ocean_point',
        status: 'unavailable',
        reason: res.message || 'Data point is currently unavailable at this coordinate/depth.',
      };
    }

    const scientificData: ScientificContext = {
      query: { lat, lon, depth, date: res.date || dateStr || null },
      physics: res.physics as Record<string, number | null> | undefined,
      bgc: res.bgc as Record<string, number | null> | undefined,
      nearest_argo_float: res.nearest_argo_float as Record<string, unknown> | undefined,
      dataset_info: res.dataset_info,
    };

    return {
      tool: 'query_ocean_point',
      status: 'success',
      data: res as unknown as Record<string, unknown>,
      summary: `Retrieved ocean data at ${lat.toFixed(2)}°, ${lon.toFixed(2)}°, depth ${depth} m (${res.date || dateStr || 'latest'}).`,
      scientific_data: scientificData,
    };
  } catch (error) {
    const msg = error instanceof UpstreamError ? error.message : 'Failed to retrieve ocean point';
    return {
      tool: 'query_ocean_point',
      status: 'error',
      reason: msg,
    };
  }
}

/**
 * Tool 2: find_nearest_argo
 * Finds nearest active Argo floats around a target coordinate.
 */
export async function executeFindNearestArgo(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const { lat, lon, radius_km, type, date } = args;

  if (!isValidLat(lat) || !isValidLon(lon)) {
    return {
      tool: 'find_nearest_argo',
      status: 'error',
      reason: 'Invalid coordinates: latitude must be [-90, 90] and longitude [-180, 180].',
    };
  }

  const radius = isFiniteNumber(radius_km) && radius_km >= 1 && radius_km <= 2000 ? radius_km : 300;
  const floatType = type === 'core' || type === 'bgc' || type === 'both' ? type : 'both';
  const dateStr = typeof date === 'string' && isValidIsoDate(date) ? date.trim() : undefined;

  try {
    const res = await fetchNearestArgoFloats({
      lat,
      lon,
      radius_km: radius,
      type: floatType,
      date: dateStr,
    });

    if (res.floats && res.floats.length > 0) {
      const nearest = res.floats[0];
      return {
        tool: 'find_nearest_argo',
        status: 'success',
        data: res as unknown as Record<string, unknown>,
        summary: `Found ${res.floats.length} float(s) within ${radius} km. Nearest is Float #${nearest.platform_number} (${nearest.type || 'Core'}, ${nearest.distance_km.toFixed(1)} km away).`,
      };
    }

    return {
      tool: 'find_nearest_argo',
      status: 'not_found',
      data: res as unknown as Record<string, unknown>,
      reason: `No active Argo floats found within ${radius} km radius of (${lat.toFixed(2)}°, ${lon.toFixed(2)}°).`,
      summary: `No Argo floats within ${radius} km.`,
    };
  } catch (error) {
    const msg = error instanceof UpstreamError ? error.message : 'Failed to search for Argo floats';
    return {
      tool: 'find_nearest_argo',
      status: 'error',
      reason: msg,
    };
  }
}

/**
 * Tool 3: get_argo_profile
 * Retrieves full depth profile observations from an Argo float or nearest float.
 */
export async function executeGetArgoProfile(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const { platform_number, lat, lon, date } = args;

  const platformStr = typeof platform_number === 'string' && platform_number.trim()
    ? platform_number.trim()
    : undefined;

  const validCoordLat = isValidLat(lat) ? lat : undefined;
  const validCoordLon = isValidLon(lon) ? lon : undefined;

  if (!platformStr && (validCoordLat === undefined || validCoordLon === undefined)) {
    return {
      tool: 'get_argo_profile',
      status: 'error',
      reason: 'Either a platform_number string or valid lat/lon coordinates must be provided.',
    };
  }

  const dateStr = typeof date === 'string' && isValidIsoDate(date) ? date.trim() : undefined;

  try {
    const res = await fetchArgoProfileData({
      platform_number: platformStr,
      lat: validCoordLat,
      lon: validCoordLon,
      date: dateStr,
    });

    if (res.status === 'success' && Array.isArray(res.profile) && res.profile.length > 0) {
      return {
        tool: 'get_argo_profile',
        status: 'success',
        data: res as unknown as Record<string, unknown>,
        summary: `Retrieved profile with ${res.profile.length} levels for float #${res.platform_number || platformStr}.`,
      };
    }

    return {
      tool: 'get_argo_profile',
      status: 'not_found',
      data: res as unknown as Record<string, unknown>,
      reason: res.message || `No depth profile observations found for float #${platformStr || 'at this coordinate'}.`,
      summary: `Profile unavailable for float #${platformStr || 'nearest'}.`,
    };
  } catch (error) {
    const msg = error instanceof UpstreamError ? error.message : 'Failed to retrieve Argo profile';
    return {
      tool: 'get_argo_profile',
      status: 'error',
      reason: msg,
    };
  }
}

/**
 * Tool 4: compare_ocean_points
 * Performs parallel point queries across 2 to 5 distinct depths at the same location.
 */
export async function executeCompareOceanPoints(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const { lat, lon, date, depths } = args;

  if (!isValidLat(lat) || !isValidLon(lon)) {
    return {
      tool: 'compare_ocean_points',
      status: 'error',
      reason: 'Invalid coordinates: latitude must be [-90, 90] and longitude [-180, 180].',
    };
  }

  if (!Array.isArray(depths) || depths.length < 2 || depths.length > 5) {
    return {
      tool: 'compare_ocean_points',
      status: 'error',
      reason: 'Invalid depths array: must provide between 2 and 5 depth values.',
    };
  }

  const validDepths: number[] = [];
  for (const d of depths) {
    if (!isValidDepth(d)) {
      return {
        tool: 'compare_ocean_points',
        status: 'error',
        reason: `Invalid depth value ${d}: every depth must satisfy 0 <= depth <= 6000.`,
      };
    }
    if (!validDepths.includes(d)) {
      validDepths.push(d);
    }
  }

  if (validDepths.length < 2) {
    return {
      tool: 'compare_ocean_points',
      status: 'error',
      reason: 'Must provide at least 2 distinct depth levels for comparison.',
    };
  }

  // Sort ascending
  validDepths.sort((a, b) => a - b);
  const dateStr = typeof date === 'string' && isValidIsoDate(date) ? date.trim() : undefined;

  try {
    const promises = validDepths.map((d) =>
      fetchOceanPoint({ lat, lon, depth: d, date: dateStr })
        .then((res) => ({ depth: d, ok: res.status === 'ok', res }))
        .catch((err) => ({ depth: d, ok: false, error: err instanceof Error ? err.message : String(err) }))
    );

    const results = await Promise.all(promises);

    const depthPointMap: Record<number, Record<string, unknown> | null> = {};
    for (const r of results) {
      if (r.ok && 'res' in r && r.res) {
        depthPointMap[r.depth] = r.res as unknown as Record<string, unknown>;
      } else {
        depthPointMap[r.depth] = null;
      }
    }

    // Build comparison matrix
    const variableConfigs = [
      { key: 'temperature_c', group: 'physics', label: 'Temperature', unit: '°C' },
      { key: 'salinity_psu', group: 'physics', label: 'Salinity', unit: 'PSU' },
      { key: 'current_speed', group: 'physics', label: 'Current Velocity', unit: 'm/s' },
      { key: 'sea_level_m', group: 'physics', label: 'Sea Level', unit: 'm' },
      { key: 'oxygen_mmolm3', group: 'bgc', label: 'Dissolved Oxygen', unit: 'mmol/m³' },
      { key: 'chlorophyll_mgl', group: 'bgc', label: 'Chlorophyll-a', unit: 'mg/m³' },
      { key: 'nitrate_mmolm3', group: 'bgc', label: 'Nitrate', unit: 'mmol/m³' },
      { key: 'phosphate_mmolm3', group: 'bgc', label: 'Phosphate', unit: 'mmol/m³' },
      { key: 'silicate_mmolm3', group: 'bgc', label: 'Silicate', unit: 'mmol/m³' },
      { key: 'ph', group: 'bgc', label: 'pH', unit: 'pH' },
      { key: 'pco2_uatm', group: 'bgc', label: 'pCO₂', unit: 'μatm' },
    ];

    const comparisonRows: ComparisonRow[] = [];

    for (const config of variableConfigs) {
      const values: Record<number, number | null> = {};
      let hasAnyNonNull = false;

      for (const d of validDepths) {
        const point = depthPointMap[d];
        if (!point) {
          values[d] = null;
          continue;
        }

        let val: number | null = null;
        if (config.key === 'current_speed') {
          const phy = point.physics as Record<string, unknown> | undefined;
          const u = isFiniteNumber(phy?.current_u_ms) ? phy.current_u_ms : null;
          const v = isFiniteNumber(phy?.current_v_ms) ? phy.current_v_ms : null;
          if (u !== null && v !== null) {
            val = Math.round(Math.sqrt(u * u + v * v) * 100) / 100;
          }
        } else {
          const subObj = (config.group === 'physics' ? point.physics : point.bgc) as Record<string, unknown> | undefined;
          if (subObj && isFiniteNumber(subObj[config.key])) {
            val = subObj[config.key] as number;
          }
        }

        values[d] = val;
        if (val !== null) hasAnyNonNull = true;
      }

      // Include row if at least one depth has data
      if (hasAnyNonNull) {
        comparisonRows.push({
          variable: config.key,
          label: config.label,
          unit: config.unit,
          values,
        });
      }
    }

    const comparisonData: DepthComparisonData = {
      lat,
      lon,
      date: dateStr || 'latest',
      depths: validDepths,
      rows: comparisonRows,
    };

    return {
      tool: 'compare_ocean_points',
      status: 'success',
      data: {
        lat,
        lon,
        date: dateStr,
        depths: validDepths,
        depth_results: depthPointMap,
        comparison_matrix: comparisonRows,
      },
      summary: `Compared ${validDepths.length} depth levels (${validDepths.join('m, ')}m) at ${lat.toFixed(2)}°, ${lon.toFixed(2)}°.`,
      comparison_data: comparisonData,
    };
  } catch (error) {
    const msg = error instanceof UpstreamError ? error.message : 'Failed to execute depth comparison';
    return {
      tool: 'compare_ocean_points',
      status: 'error',
      reason: msg,
    };
  }
}

/**
 * Tool 5: set_visualization_state
 * Safely updates active 3D/4D Explorer view parameters (depth, date, coordinates).
 */
export async function executeSetVisualizationState(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const { depth, date, lat, lon } = args;

  const hasDepth = depth !== undefined && depth !== null;
  const hasDate = date !== undefined && date !== null;
  const hasLat = lat !== undefined && lat !== null;
  const hasLon = lon !== undefined && lon !== null;

  if (!hasDepth && !hasDate && !hasLat && !hasLon) {
    return {
      tool: 'set_visualization_state',
      status: 'error',
      reason: 'No visualization parameters specified. Provide at least one of: depth, date, lat, lon.',
    };
  }

  const payload: { depth?: number; date?: string; lat?: number; lon?: number } = {};
  const summaryParts: string[] = [];

  // Validate depth
  if (hasDepth) {
    if (!isValidDepth(depth)) {
      return {
        tool: 'set_visualization_state',
        status: 'error',
        reason: `Invalid depth value ${depth}: depth must satisfy 0 <= depth <= 6000 meters.`,
      };
    }
    payload.depth = depth;
    if (depth === 0) {
      summaryParts.push('Returning to ocean surface (0 m)');
    } else {
      summaryParts.push(`Setting depth to ${depth} m`);
    }
  }

  // Validate coordinates
  if (hasLat || hasLon) {
    if (!hasLat || !hasLon) {
      return {
        tool: 'set_visualization_state',
        status: 'error',
        reason: 'Both latitude and longitude must be provided when adjusting coordinates.',
      };
    }
    if (!isValidLat(lat) || !isValidLon(lon)) {
      return {
        tool: 'set_visualization_state',
        status: 'error',
        reason: 'Invalid coordinates: latitude must be [-90, 90] and longitude [-180, 180].',
      };
    }
    payload.lat = lat;
    payload.lon = lon;
    const latCard = lat >= 0 ? `${lat.toFixed(3)}°N` : `${Math.abs(lat).toFixed(3)}°S`;
    const lonCard = lon >= 0 ? `${lon.toFixed(3)}°E` : `${Math.abs(lon).toFixed(3)}°W`;
    summaryParts.push(`Moving Explorer to ${latCard}, ${lonCard}`);
  }

  // Validate date
  if (hasDate) {
    if (typeof date !== 'string' || !isValidIsoDate(date)) {
      return {
        tool: 'set_visualization_state',
        status: 'error',
        reason: 'Invalid date format: date must be in YYYY-MM-DD format.',
      };
    }
    payload.date = date.trim();
    summaryParts.push(`Setting date to ${date.trim()}`);
  }

  const summary = summaryParts.join(' · ');

  return {
    tool: 'set_visualization_state',
    status: 'success',
    data: payload as unknown as Record<string, unknown>,
    summary,
    visualization_action: {
      type: 'set_visualization_state',
      payload,
      summary,
    },
  };
}

/**
 * Dispatcher: Execute any registered scientific tool by name with safety checks.
 */
export async function executeScientificTool(
  name: string,
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  switch (name) {
    case 'query_ocean_point':
      return executeQueryOceanPoint(args);
    case 'find_nearest_argo':
      return executeFindNearestArgo(args);
    case 'get_argo_profile':
      return executeGetArgoProfile(args);
    case 'compare_ocean_points':
      return executeCompareOceanPoints(args);
    case 'set_visualization_state':
      return executeSetVisualizationState(args);
    default:
      return {
        tool: name,
        status: 'error',
        reason: `Unknown scientific tool '${name}'. Only defined OceanStream tools are permitted.`,
      };
  }
}

