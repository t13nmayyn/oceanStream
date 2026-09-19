/**
 * ocean.controller.ts
 * Handles GET /api/ocean/point:
 *  1. Parse and validate query parameters.
 *  2. Reject invalid values with HTTP 400 before touching the upstream.
 *  3. Forward to the Python service and relay the response.
 *  4. Map upstream/network errors to appropriate HTTP status codes.
 */

import { Request, Response } from 'express';
import { fetchOceanPoint, UpstreamError } from '../services/pythonOcean.service';
import { GatewayError, OceanPointQuery } from '../types/ocean.types';

/** Latitude/longitude valid ranges */
const LAT_MIN = -90;
const LAT_MAX = 90;
const LON_MIN = -180;
const LON_MAX = 180;
const DEPTH_MIN = 0;
const DEPTH_MAX = 11000; // Hadal max (Mariana Trench)

/**
 * Parse a required numeric query parameter.
 * Returns NaN if the value is missing, empty, or non-numeric.
 */
function parseNumeric(raw: unknown): number {
  if (raw === undefined || raw === null || raw === '') return NaN;
  return Number(raw);
}

export async function getOceanPoint(req: Request, res: Response): Promise<void> {
  // ── 1. Parse ─────────────────────────────────────────────────────────────
  const lat = parseNumeric(req.query.lat);
  const lon = parseNumeric(req.query.lon);
  const depth = parseNumeric(req.query.depth ?? '0');
  const date = typeof req.query.date === 'string' ? req.query.date.trim() : undefined;

  // ── 2. Validate ──────────────────────────────────────────────────────────
  const errors: string[] = [];

  if (isNaN(lat)) {
    errors.push('`lat` is required and must be a number');
  } else if (lat < LAT_MIN || lat > LAT_MAX) {
    errors.push(`\`lat\` must be between ${LAT_MIN} and ${LAT_MAX} (got ${lat})`);
  }

  if (isNaN(lon)) {
    errors.push('`lon` is required and must be a number');
  } else if (lon < LON_MIN || lon > LON_MAX) {
    errors.push(`\`lon\` must be between ${LON_MIN} and ${LON_MAX} (got ${lon})`);
  }

  if (isNaN(depth)) {
    errors.push('`depth` must be a number when provided');
  } else if (depth < DEPTH_MIN || depth > DEPTH_MAX) {
    errors.push(`\`depth\` must be between ${DEPTH_MIN} and ${DEPTH_MAX} (got ${depth})`);
  }

  // Loose ISO date check — Python router handles full normalization
  if (date !== undefined && date.length > 0 && !/^\d{4}-\d{2}-\d{2}$/.test(date) && !/^(today|yesterday|latest|now)$/i.test(date)) {
    errors.push('`date` must be YYYY-MM-DD or a keyword (today, yesterday, latest)');
  }

  if (errors.length > 0) {
    const body: GatewayError = { error: 'Invalid query parameters', details: errors.join('; ') };
    res.status(400).json(body);
    return;
  }

  // ── 3. Forward ───────────────────────────────────────────────────────────
  const query: OceanPointQuery = { lat, lon, depth, date };

  try {
    const data = await fetchOceanPoint(query);
    res.json(data);
  } catch (err) {
    if (err instanceof UpstreamError) {
      console.error(`[gateway] Upstream error for point (${lat}, ${lon}):`, err.message);
      const body: GatewayError = {
        error: 'Python backend error',
        details: err.message,
      };
      res.status(err.httpStatus).json(body);
      return;
    }

    // Generic / unexpected error — do not leak stack trace to client
    console.error('[gateway] Unexpected error in getOceanPoint:', err);
    const body: GatewayError = { error: 'Internal gateway error' };
    res.status(500).json(body);
  }
}
