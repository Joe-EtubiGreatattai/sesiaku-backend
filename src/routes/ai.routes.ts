import { Router } from 'express';
import * as ai from '../controllers/ai.controller';
import { authenticate } from '../middleware/auth.middleware';
import { checkCopilotLimit } from '../middleware/subscription.middleware';

const router = Router();

router.post('/copilot', authenticate, checkCopilotLimit, ai.copilot);
router.get('/usage', authenticate, ai.getUsage);

export default router;
