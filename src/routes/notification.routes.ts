import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import * as NotificationController from '../controllers/notification.controller';

const router = Router();

router.use(authenticate);

router.get('/', NotificationController.getNotifications);
router.get('/unread-count', NotificationController.getUnreadCount);
router.patch('/:notificationId/read', NotificationController.markAsRead);
router.patch('/read-all', NotificationController.markAllAsRead);

export default router;
