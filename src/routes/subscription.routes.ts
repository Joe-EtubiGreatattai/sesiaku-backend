import { Router } from 'express';
import * as subs from '../controllers/subscription.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.get('/plans', subs.getPlans);
router.get('/me', authenticate, subs.getMySubscription);
router.post('/initiate', authenticate, subs.initiateSubscription);
router.post('/verify/:reference', authenticate, subs.verifySubscription);
router.post('/cancel', authenticate, subs.cancelSubscription);
router.post('/webhook', subs.paystackWebhook);

export default router;
