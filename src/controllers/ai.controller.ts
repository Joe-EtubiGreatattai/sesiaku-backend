import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { generateMangaScript } from '../services/gemini.service';
import CopilotLog from '../models/CopilotLog.model';
import Chapter from '../models/Chapter.model';
import Panel from '../models/Panel.model';
import User from '../models/User.model';

const PLAN_LIMITS: Record<string, number> = { free: 10, basic: 80, pro: 300 };

export async function copilot(req: AuthRequest, res: Response): Promise<void> {
  const { mangaId, chapterId, direction, context } = req.body;
  if (!direction?.trim()) { res.status(400).json({ error: 'Direction is required' }); return; }

  const chapter = await Chapter.findOne({ _id: chapterId, mangaId, authorId: req.user!._id });
  if (!chapter) { res.status(404).json({ error: 'Chapter not found' }); return; }

  // Build context from recent panels if not provided
  let recentPanels = context?.recentPanels;
  if (!recentPanels) {
    const panels = await Panel.find({ chapterId }).sort({ order: -1 }).limit(3);
    recentPanels = panels.reverse().map(p => ({
      type: p.panelType,
      text: p.content.text,
      character: p.content.characterName,
    }));
  }

  const { panels, tokensUsed } = await generateMangaScript(direction, {
    seriesTitle: context?.seriesTitle || 'My Manga',
    genre: context?.genre || [],
    chapterTitle: chapter.title,
    recentPanels,
  });

  const log = await CopilotLog.create({
    userId: req.user!._id,
    mangaId,
    chapterId,
    userDirection: direction,
    generatedScript: { panels },
    panelsCreated: panels.length,
    tokensUsed,
  });

  // Increment usage
  await User.findByIdAndUpdate(req.user!._id, { $inc: { aiUsageThisMonth: 1 } });

  res.json({ panels, copilotLogId: log._id, tokensUsed });
}

export async function getUsage(req: AuthRequest, res: Response): Promise<void> {
  const user = req.user!;
  res.json({
    aiUsageThisMonth: user.aiUsageThisMonth,
    aiLimit: PLAN_LIMITS[user.subscriptionTier],
    aiUsageResetDate: user.aiUsageResetDate,
    plan: user.subscriptionTier,
  });
}
