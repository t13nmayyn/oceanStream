import { Router } from 'express';
import { getArgoNearest, getArgoProfile } from '../controllers/argo.controller';

const router = Router();

router.get('/nearest', getArgoNearest);
router.get('/profile', getArgoProfile);

export default router;
