import { Router } from 'express';
import { postAiChat } from '../controllers/ai.controller';

const router = Router();

router.post('/chat', postAiChat);

export default router;