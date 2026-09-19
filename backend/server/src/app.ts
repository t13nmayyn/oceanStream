/**
 * app.ts
 * Configures and returns the Express application.
 * Keeping this separate from server.ts allows the app to be tested
 * without starting a real HTTP server.
 */

import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import oceanRoutes from './routes/ocean.routes';
import aiRoutes from './routes/ai.routes';
import { GatewayError } from './types/ocean.types';

export function createApp(): Application {
  const app = express();

  // ── Middleware ────────────────────────────────────────────────────────────
  app.use(cors());              // Allow all origins — suitable for local dev
  app.use(express.json());

  // ── Health check ─────────────────────────────────────────────────────────
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      gateway: 'oceanStream-node',
      version: '1.0.0',
      upstream: process.env.PYTHON_API_URL ?? 'http://127.0.0.1:8000',
    });
  });

  // ── API Routes ───────────────────────────────────────────────────────────
  app.use('/api/ocean', oceanRoutes);
  app.use('/api/ai', aiRoutes);

  // ── 404 handler ──────────────────────────────────────────────────────────
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' } satisfies GatewayError);
  });

  // ── Global error handler ──────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[gateway] Unhandled error:', err.message);
    res.status(500).json({ error: 'Internal server error' } satisfies GatewayError);
  });

  return app;
}
