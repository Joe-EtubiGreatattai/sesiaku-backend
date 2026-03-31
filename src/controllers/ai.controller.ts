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

  console.log('[Copilot] Request received:', { userId: req.user!._id, mangaId, chapterId, direction });

  if (!direction?.trim()) {
    console.log('[Copilot] Rejected — direction is missing');
    res.status(400).json({ error: 'Direction is required' }); return;
  }

  const [chapter, manga] = await Promise.all([
    Chapter.findOne({ _id: chapterId, mangaId, authorId: req.user!._id }),
    Manga.findById(mangaId).select('title description genre tags ageRating'),
  ]);

  if (!chapter) {
    console.log('[Copilot] Rejected — chapter not found:', { chapterId, mangaId, userId: req.user!._id });
    res.status(404).json({ error: 'Chapter not found' }); return;
  }
  if (!manga) {
    console.log('[Copilot] Rejected — manga not found:', { mangaId });
    res.status(404).json({ error: 'Manga not found' }); return;
  }

  console.log('[Copilot] Manga:', manga.title, '| Chapter:', chapter.title, `(#${chapter.chapterNumber})`);
  console.log('[Copilot] Genre:', manga.genre, '| Age rating:', manga.ageRating);

  const allChapterPanels = await Panel.find({ chapterId }).sort({ order: 1 }).select('order panelType content');
  console.log('[Copilot] Total panels in chapter:', allChapterPanels.length,
    '| Types:', allChapterPanels.map(p => p.panelType).join(', ') || 'none');

  const OPENING_COUNT = 2;
  const RECENT_COUNT  = 5;

  const textPanels = allChapterPanels.filter(p => p.panelType !== 'image' && p.content.text);
  console.log('[Copilot] Text panels for context:', textPanels.length);

  const toContextPanel = (p: typeof textPanels[0]): ContextPanel => ({
    type: p.panelType as 'dialog' | 'narration',
    text: p.content.text as string,
    character: p.content.characterName,
  });

  const openingPanels: ContextPanel[] = textPanels.slice(0, OPENING_COUNT).map(toContextPanel);
  const recentStart = Math.max(OPENING_COUNT, textPanels.length - RECENT_COUNT);
  const recentPanels: ContextPanel[] = textPanels.slice(recentStart).map(toContextPanel);

  const knownCharacters = [
    ...new Set(
      allChapterPanels
        .filter(p => p.panelType === 'dialog' && p.content.characterName)
        .map(p => p.content.characterName as string)
    ),
  ];

  console.log('[Copilot] Known characters:', knownCharacters.length ? knownCharacters.join(', ') : 'none');
  console.log('[Copilot] Opening panels:', openingPanels.length, '| Recent panels:', recentPanels.length);
  console.log('[Copilot] Sending to Gemini...');

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
    ...context,
  });

  console.log('[Copilot] Gemini returned', panels.length, 'panels | Tokens used:', tokensUsed);

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

  console.log('[Copilot] Done. Log ID:', log._id);
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
