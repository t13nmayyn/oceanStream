/**
 * ocean.routes.ts
 * Registers all /api/ocean/* routes on the provided Express Router.
 */

import { Router } from 'express';
import { getOceanPoint } from '../controllers/ocean.controller';

const router = Router();

/**
 * GET /api/ocean/point
 * Query: lat, lon, depth?, date?
 * Validates params then proxies to the Python /ocean/point endpoint.
 */
router.get('/point', getOceanPoint);

export default router;
