import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';
import Manga from '../models/Manga.model';
import Chapter from '../models/Chapter.model';

const PLAN_LIMITS = {
  free: { seriesMax: 3, chaptersPerSeries: 3, aiUsesPerMonth: 10 },
  basic: { seriesMax: 15, chaptersPerSeries: Infinity, aiUsesPerMonth: 80 },
  pro: { seriesMax: Infinity, chaptersPerSeries: Infinity, aiUsesPerMonth: 300 },
};

export async function checkSeriesLimit(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const user = req.user!;
  const limits = PLAN_LIMITS[user.subscriptionTier];
  if (limits.seriesMax === Infinity) { next(); return; }

  console.log('--- SUBSCRIPTION CHECK: SERIES ---');
  const count = await Manga.countDocuments({ authorId: user._id });
  console.log(`User: ${user._id} (${user.subscriptionTier}) | Current: ${count} | Limit: ${limits.seriesMax}`);

  if (count >= limits.seriesMax) {
    console.warn(`LIMIT REACHED: User ${user._id} has reached series limit (${limits.seriesMax})`);
    res.status(403).json({
      error: 'subscription_limit_reached',
      limit: 'series_count',
      currentPlan: user.subscriptionTier,
      upgradeRequired: true,
    });
    return;
  }
  next();
}

export async function checkChapterLimit(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const user = req.user!;
  const limits = PLAN_LIMITS[user.subscriptionTier];
  if (limits.chaptersPerSeries === Infinity) { next(); return; }

  console.log('--- SUBSCRIPTION CHECK: CHAPTER ---');
  const { mangaId } = req.params;
  const count = await Chapter.countDocuments({ mangaId, authorId: user._id });
  console.log(`User: ${user._id} (${user.subscriptionTier}) | Manga: ${mangaId} | Current: ${count} | Limit: ${limits.chaptersPerSeries}`);

  if (count >= limits.chaptersPerSeries) {
    console.warn(`LIMIT REACHED: User ${user._id} reached chapter limit for manga ${mangaId}`);
    res.status(403).json({
      error: 'subscription_limit_reached',
      limit: 'chapter_count',
      currentPlan: user.subscriptionTier,
      upgradeRequired: true,
    });
    return;
  }
  next();
}

export async function checkCopilotLimit(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const user = req.user!;
  const limits = PLAN_LIMITS[user.subscriptionTier];

  // Reset monthly usage if needed
  if (new Date() >= user.aiUsageResetDate) {
    user.aiUsageThisMonth = 0;
    const nextReset = new Date();
    nextReset.setMonth(nextReset.getMonth() + 1, 1);
    nextReset.setHours(0, 0, 0, 0);
    user.aiUsageResetDate = nextReset;
    await user.save();
  }

  console.log('--- SUBSCRIPTION CHECK: COPILOT ---');
  console.log(`User: ${user._id} (${user.subscriptionTier}) | Usage: ${user.aiUsageThisMonth} | Limit: ${limits.aiUsesPerMonth}`);

  if (user.aiUsageThisMonth >= limits.aiUsesPerMonth) {
    console.warn(`LIMIT REACHED: User ${user._id} reached Copilot limit (${limits.aiUsesPerMonth})`);
    res.status(403).json({
      error: 'copilot_limit_reached',
      currentUsage: user.aiUsageThisMonth,
      limit: limits.aiUsesPerMonth,
      currentPlan: user.subscriptionTier,
      upgradeRequired: true,
    });
    return;
  }
  next();
}
