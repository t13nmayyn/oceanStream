import { Router } from 'express';
import { getDateInfo, getCacheStats, clearCache } from '../controllers/system.controller';

const router = Router();

router.get('/date-info', getDateInfo);
router.get('/cache-stats', getCacheStats);
router.post('/cache-clear', clearCache);

export default router;
