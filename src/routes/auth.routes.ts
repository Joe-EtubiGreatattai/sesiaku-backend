import { Router } from 'express';
import * as auth from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.get('/me', authenticate, auth.getMe);
router.post('/sync', authenticate, auth.sync);

export default router;
