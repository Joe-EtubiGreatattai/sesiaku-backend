import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import Notification from '../models/Notification.model';

export async function getNotifications(req: AuthRequest, res: Response): Promise<void> {
  const page = Number(req.query.page) || 1;
  const limit = 20;

  const notifications = await Notification.find({ recipientId: req.user!._id })
    .populate('senderId', 'username displayName avatarUrl')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);

  res.json({ notifications, page });
}

export async function markAsRead(req: AuthRequest, res: Response): Promise<void> {
  const notification = await Notification.findOne({
    _id: req.params.notificationId,
    recipientId: req.user!._id,
  });

  if (!notification) {
    res.status(404).json({ error: 'Notification not found' });
    return;
  }

  notification.isRead = true;
  await notification.save();

  res.json({ notification });
}

export async function markAllAsRead(req: AuthRequest, res: Response): Promise<void> {
  await Notification.updateMany(
    { recipientId: req.user!._id, isRead: false },
    { $set: { isRead: true } }
  );

  res.json({ message: 'All notifications marked as read' });
}

export async function getUnreadCount(req: AuthRequest, res: Response): Promise<void> {
  const count = await Notification.countDocuments({
    recipientId: req.user!._id,
    isRead: false,
  });

  res.json({ count });
}
