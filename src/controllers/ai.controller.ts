import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { generateMangaScript, ContextPanel } from '../services/gemini.service';
import CopilotLog from '../models/CopilotLog.model';
import Chapter from '../models/Chapter.model';
import Panel from '../models/Panel.model';
import Manga from '../models/Manga.model';
import User from '../models/User.model';

const PLAN_LIMITS: Record<string, number> = { free: 10, basic: 80, pro: 300 };

export async function copilot(req: AuthRequest, res: Response): Promise<void> {
  const { mangaId, chapterId, direction, context } = req.body;
  if (!direction?.trim()) { res.status(400).json({ error: 'Direction is required' }); return; }

  const [chapter, manga] = await Promise.all([
    Chapter.findOne({ _id: chapterId, mangaId, authorId: req.user!._id }),
    Manga.findById(mangaId).select('title description genre tags ageRating'),
  ]);

  if (!chapter) { res.status(404).json({ error: 'Chapter not found' }); return; }
  if (!manga)   { res.status(404).json({ error: 'Manga not found' }); return; }

  // Fetch all panels in this chapter sorted by order
  const allChapterPanels = await Panel.find({ chapterId }).sort({ order: 1 }).select('order panelType content');

  // First 2 panels establish chapter tone; last 5 give immediate prior context
  const OPENING_COUNT = 2;
  const RECENT_COUNT  = 5;

  const openingPanels: ContextPanel[] = allChapterPanels
    .slice(0, OPENING_COUNT)
    .map(p => ({ type: p.panelType as 'dialog' | 'narration', text: p.content.text, character: p.content.characterName }));

  // Avoid duplicating panels that appear in both opening and recent windows
  const recentStart = Math.max(OPENING_COUNT, allChapterPanels.length - RECENT_COUNT);
  const recentPanels: ContextPanel[] = allChapterPanels
    .slice(recentStart)
    .map(p => ({ type: p.panelType as 'dialog' | 'narration', text: p.content.text, character: p.content.characterName }));

  // Deduplicate character names from all dialog panels in the chapter
  const knownCharacters = [
    ...new Set(
      allChapterPanels
        .filter(p => p.panelType === 'dialog' && p.content.characterName)
        .map(p => p.content.characterName as string)
    ),
  ];

  const { panels, tokensUsed } = await generateMangaScript(direction, {
    seriesTitle:       manga.title,
    seriesDescription: manga.description,
    genre:             manga.genre,
    tags:              manga.tags,
    ageRating:         manga.ageRating,
    chapterTitle:      chapter.title,
    chapterNumber:     chapter.chapterNumber,
    chapterNotes:      chapter.notes,
    openingPanels:     openingPanels.length  ? openingPanels  : undefined,
    recentPanels:      recentPanels.length   ? recentPanels   : undefined,
    knownCharacters:   knownCharacters.length ? knownCharacters : undefined,
    // Allow caller to override context fields (e.g. from client-side state)
    ...context,
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
