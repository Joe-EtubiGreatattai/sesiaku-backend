import { Response } from 'express';
import multer from 'multer';
import User from '../models/User.model';
import Manga from '../models/Manga.model';
import Follow from '../models/Follow.model';
import { uploadImage, deleteImage } from '../services/cloudinary.service';
import { AuthRequest } from '../middleware/auth.middleware';
import Notification, { NotificationType } from '../models/Notification.model';
import { emitToUser } from '../utils/socket';

export const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const PLAN_LIMITS = {
  free: { seriesMax: 3, chaptersPerSeries: 3, aiUsesPerMonth: 10 },
  basic: { seriesMax: 15, chaptersPerSeries: Infinity, aiUsesPerMonth: 80 },
  pro: { seriesMax: Infinity, chaptersPerSeries: Infinity, aiUsesPerMonth: 300 },
};

export async function getMe(req: AuthRequest, res: Response): Promise<void> {
  const user = req.user!;
  const limits = PLAN_LIMITS[user.subscriptionTier];
  res.json({
    user,
    limits: {
      seriesMax: limits.seriesMax === Infinity ? null : limits.seriesMax,
      chaptersPerSeries: limits.chaptersPerSeries === Infinity ? null : limits.chaptersPerSeries,
      aiUsesPerMonth: limits.aiUsesPerMonth,
      aiUsageThisMonth: user.aiUsageThisMonth,
    },
  });
}

export async function updateMe(req: AuthRequest, res: Response): Promise<void> {
  const user = req.user!;
  const { displayName, bio, username } = req.body;

  if (username && username !== user.username) {
    const exists = await User.findOne({ username, _id: { $ne: user._id } });
    if (exists) { res.status(409).json({ error: 'Username already taken' }); return; }
    user.username = username.trim();
  }
  if (displayName) user.displayName = displayName.trim();
  if (bio !== undefined) user.bio = bio;

  // Handle avatar upload
  if (req.file) {
    if (user.avatarPublicId) await deleteImage(user.avatarPublicId);
    const { url, publicId } = await uploadImage(req.file.buffer, 'avatar', String(user._id));
    user.avatarUrl = url;
    user.avatarPublicId = publicId;
  }

  await user.save();
  res.json({ user });
}

export async function deleteMe(req: AuthRequest, res: Response): Promise<void> {
  const user = req.user!;
  if (user.avatarPublicId) await deleteImage(user.avatarPublicId);
  await User.findByIdAndDelete(user._id);
  res.json({ message: 'Account deleted' });
}

export async function getUser(req: AuthRequest, res: Response): Promise<void> {
  const user = await User.findById(req.params.userId).select('-refreshTokens -passwordHash');
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }
  res.json({ user });
}

export async function followUser(req: AuthRequest, res: Response): Promise<void> {
  const followerId = req.user!._id;
  const followingId = String(req.params.userId);
  if (String(followerId) === followingId) { res.status(400).json({ error: 'Cannot follow yourself' }); return; }

  const targetUser = await User.findById(followingId);
  if (!targetUser) { res.status(404).json({ error: 'User not found' }); return; }

  const existing = await Follow.findOne({ followerId, followingId });
  if (existing) { res.status(409).json({ error: 'Already following' }); return; }

  await Follow.create({ followerId, followingId });
  await User.findByIdAndUpdate(followingId, { $inc: { followersCount: 1 } });
  await User.findByIdAndUpdate(followerId, { $inc: { followingCount: 1 } });

  // Notification
  const notification = await Notification.create({
    recipientId: followingId,
    senderId: followerId,
    type: NotificationType.FOLLOW,
    text: `${req.user!.displayName} started following you!`,
  });
  const populated = await notification.populate('senderId', 'username displayName avatarUrl');
  emitToUser(followingId, 'notification', populated);

  res.json({ message: 'Followed successfully' });
}

export async function unfollowUser(req: AuthRequest, res: Response): Promise<void> {
  const followerId = req.user!._id;
  const followingId = req.params.userId;
  const follow = await Follow.findOneAndDelete({ followerId, followingId });
  if (!follow) { res.status(404).json({ error: 'Not following this user' }); return; }
  await User.findByIdAndUpdate(followingId, { $inc: { followersCount: -1 } });
  await User.findByIdAndUpdate(followerId, { $inc: { followingCount: -1 } });
  res.json({ message: 'Unfollowed successfully' });
}

export async function getFollowers(req: AuthRequest, res: Response): Promise<void> {
  const page = Number(req.query.page) || 1;
  const limit = 20;
  const follows = await Follow.find({ followingId: req.params.userId })
    .populate('followerId', 'username displayName avatarUrl')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);
  res.json({ followers: follows.map(f => f.followerId), page });
}

export async function getFollowing(req: AuthRequest, res: Response): Promise<void> {
  const page = Number(req.query.page) || 1;
  const limit = 20;
  const follows = await Follow.find({ followerId: req.params.userId })
    .populate('followingId', 'username displayName avatarUrl')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);
  res.json({ following: follows.map(f => f.followingId), page });
}

export async function getUserManga(req: AuthRequest, res: Response): Promise<void> {
  const page = Number(req.query.page) || 1;
  const limit = 20;
  const manga = await Manga.find({ authorId: req.params.userId, publishStatus: 'published' })
    .sort({ publishedAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);
  res.json({ manga, page });
}

export async function getUsage(req: AuthRequest, res: Response): Promise<void> {
  const user = req.user!;
  const limits = PLAN_LIMITS[user.subscriptionTier];
  res.json({
    aiUsageThisMonth: user.aiUsageThisMonth,
    aiLimit: limits.aiUsesPerMonth,
    aiUsageResetDate: user.aiUsageResetDate,
    plan: user.subscriptionTier,
  });
}
