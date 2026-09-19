/**
 * server.ts
 * Entry point — loads environment, creates the Express app, and starts listening.
 */

import 'dotenv/config';
import { createApp } from './app';

const PORT = parseInt(process.env.PORT ?? '3001', 10);
const PYTHON_API_URL = process.env.PYTHON_API_URL ?? 'http://127.0.0.1:8000';

const app = createApp();

app.listen(PORT, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════════╗');
  console.log('  ║   oceanStream Node Gateway  v1.0.0           ║');
  console.log('  ╠══════════════════════════════════════════════╣');
  console.log(`  ║   Gateway:  http://localhost:${PORT}              ║`);
  console.log(`  ║   Upstream: ${PYTHON_API_URL.padEnd(32)} ║`);
  console.log('  ║   Route:    GET /api/ocean/point             ║');
  console.log('  ║   Health:   GET /health                      ║');
  console.log('  ╚══════════════════════════════════════════════╝');
  console.log('');
});
