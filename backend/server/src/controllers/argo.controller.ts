import { Request, Response } from 'express';
import { fetchNearestArgoFloats, fetchArgoProfileData, UpstreamError } from '../services/pythonOcean.service';
import { GatewayError } from '../types/ocean.types';

function parseNumeric(raw: unknown): number {
  if (raw === undefined || raw === null || raw === '') return NaN;
  return Number(raw);
}

export async function getArgoNearest(req: Request, res: Response): Promise<void> {
  const lat = parseNumeric(req.query.lat);
  const lon = parseNumeric(req.query.lon);
  const radius_km = parseNumeric(req.query.radius_km ?? '300');
  const type = typeof req.query.type === 'string' ? req.query.type.trim() as any : undefined;
  const date = typeof req.query.date === 'string' ? req.query.date.trim() : undefined;

  const errors: string[] = [];
  if (isNaN(lat) || isNaN(lon)) {
    errors.push('lat and lon are required and must be numbers');
  }

  if (errors.length > 0) {
    res.status(400).json({ error: 'Invalid query parameters', details: errors.join('; ') } as GatewayError);
    return;
  }

  try {
    const data = await fetchNearestArgoFloats({ lat, lon, radius_km, type, date });
    res.json(data);
  } catch (err) {
    if (err instanceof UpstreamError) {
      res.status(err.httpStatus).json({ error: 'Python backend error', details: err.message });
      return;
    }
    console.error('[gateway] Unexpected error in getArgoNearest:', err);
    res.status(500).json({ error: 'Internal gateway error' });
  }
}

export async function getArgoProfile(req: Request, res: Response): Promise<void> {
  const platform_number = typeof req.query.platform_number === 'string' ? req.query.platform_number.trim() : undefined;
  const lat = parseNumeric(req.query.lat);
  const lon = parseNumeric(req.query.lon);
  const date = typeof req.query.date === 'string' ? req.query.date.trim() : undefined;

  if (!platform_number && (isNaN(lat) || isNaN(lon))) {
    res.status(400).json({ error: 'Invalid query parameters', details: 'Must provide either platform_number OR lat/lon' } as GatewayError);
    return;
  }

  try {
    const data = await fetchArgoProfileData({
      platform_number,
      lat: isNaN(lat) ? undefined : lat,
      lon: isNaN(lon) ? undefined : lon,
      date
    });
    res.json(data);
  } catch (err) {
    if (err instanceof UpstreamError) {
      res.status(err.httpStatus).json({ error: 'Python backend error', details: err.message });
      return;
    }
    console.error('[gateway] Unexpected error in getArgoProfile:', err);
    res.status(500).json({ error: 'Internal gateway error' });
  }
}
