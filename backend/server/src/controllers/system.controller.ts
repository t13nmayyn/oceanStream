import { Request, Response } from 'express';

const PYTHON_API_URL = process.env.PYTHON_API_URL ?? 'http://127.0.0.1:8000';

export async function getDateInfo(req: Request, res: Response) {
  try {
    const response = await fetch(`${PYTHON_API_URL}/api/date-info`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'Failed to fetch date-info from upstream' });
  }
}

export async function getCacheStats(req: Request, res: Response) {
  try {
    const response = await fetch(`${PYTHON_API_URL}/api/cache-stats`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'Failed to fetch cache-stats from upstream' });
  }
}

export async function clearCache(req: Request, res: Response) {
  try {
    const response = await fetch(`${PYTHON_API_URL}/api/cache-clear`, { method: 'POST' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'Failed to clear cache on upstream' });
  }
}
