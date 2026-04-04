import { Response } from 'express';
import multer from 'multer';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse: (buffer: Buffer) => Promise<{ text: string }> = require('pdf-parse');
import mammoth from 'mammoth';
import Manga from '../models/Manga.model';
import Chapter from '../models/Chapter.model';
import Panel from '../models/Panel.model';
import Like from '../models/Like.model';
import Comment from '../models/Comment.model';
import CommentAction, { CommentActionType } from '../models/CommentAction.model';
import User from '../models/User.model';
import { uploadImage, deleteImage } from '../services/cloudinary.service';
import { AuthRequest } from '../middleware/auth.middleware';
import Notification, { NotificationType } from '../models/Notification.model';
import { emitToUser, emitToRoom } from '../utils/socket';

export const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
export const panelUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// --- Series ---

export async function createManga(req: AuthRequest, res: Response): Promise<void> {
  console.log('[createManga] Request body:', req.body);
  console.log('[createManga] Request file:', req.file ? {
    fieldname: req.file.fieldname,
    originalname: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size
  } : 'No file');

  const { title, description, genre, ageRating, tags, status } = req.body;
  if (!title) {
    console.log('[createManga] Error: Title is required');
    res.status(400).json({ error: 'Title is required' });
    return;
  }

  try {
    const manga = await Manga.create({
      authorId: req.user!._id,
      title: title.trim(),
      description,
      genre: Array.isArray(genre) ? genre : genre ? [genre] : [],
      ageRating: ageRating || 'all-ages',
      tags: Array.isArray(tags) ? tags : tags ? [tags] : [],
      status: status || 'ongoing',
    });

    if (req.file) {
      console.log('[createManga] Uploading cover image for manga:', manga._id);
      const { url, publicId } = await uploadImage(req.file.buffer, 'cover', String(manga._id));
      manga.coverUrl = url;
      manga.coverPublicId = publicId;
      await manga.save();
      console.log('[createManga] Cover image uploaded successfully');
    }

    await User.findByIdAndUpdate(req.user!._id, { $inc: { mangaCount: 1 } });
    
    console.log('[createManga] Success response:', { 
      mangaId: manga._id, 
      title: manga.title,
      authorId: manga.authorId 
    });

    res.status(201).json({ manga });
  } catch (error) {
    console.error('[createManga] Unexpected error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getManga(req: AuthRequest, res: Response): Promise<void> {
  const manga = await Manga.findById(req.params.mangaId).populate('authorId', 'username displayName avatarUrl');
  if (!manga) { res.status(404).json({ error: 'Manga not found' }); return; }

  const authorId = manga.authorId && typeof manga.authorId === 'object' && '_id' in manga.authorId 
    ? String(manga.authorId._id) 
    : String(manga.authorId);

  if (manga.publishStatus === 'draft' && authorId !== String(req.user?._id)) {
    res.status(403).json({ error: 'Not authorized' }); return;
  }

  const chapters = await Chapter.find({
    mangaId: manga._id,
    ...(authorId !== String(req.user?._id) ? { publishStatus: 'published' } : {}),
  }).sort({ chapterNumber: 1 });

  const isLiked = req.user ? !!(await Like.findOne({ userId: req.user._id, mangaId: manga._id })) : false;
  res.json({ manga, chapters, isLiked });
}

export async function updateManga(req: AuthRequest, res: Response): Promise<void> {
  const manga = await Manga.findOne({ _id: req.params.mangaId, authorId: req.user!._id });
  if (!manga) { res.status(404).json({ error: 'Manga not found' }); return; }

  const { title, description, genre, ageRating, tags, status } = req.body;
  if (title) manga.title = title.trim();
  if (description !== undefined) manga.description = description;
  if (genre) manga.genre = Array.isArray(genre) ? genre : [genre];
  if (ageRating) manga.ageRating = ageRating;
  if (tags) manga.tags = Array.isArray(tags) ? tags : [tags];
  if (status) manga.status = status;

  if (req.file) {
    if (manga.coverPublicId) await deleteImage(manga.coverPublicId);
    const { url, publicId } = await uploadImage(req.file.buffer, 'cover', String(manga._id));
    manga.coverUrl = url;
    manga.coverPublicId = publicId;
  }

  await manga.save();
  res.json({ manga });
}

export async function deleteManga(req: AuthRequest, res: Response): Promise<void> {
  const manga = await Manga.findOne({ _id: req.params.mangaId, authorId: req.user!._id });
  if (!manga) { res.status(404).json({ error: 'Manga not found' }); return; }
  if (manga.coverPublicId) await deleteImage(manga.coverPublicId);
  await Panel.deleteMany({ mangaId: manga._id });
  await Chapter.deleteMany({ mangaId: manga._id });
  await Manga.findByIdAndDelete(manga._id);
  await User.findByIdAndUpdate(req.user!._id, { $inc: { mangaCount: -1 } });
  res.json({ message: 'Manga deleted' });
}

export async function publishManga(req: AuthRequest, res: Response): Promise<void> {
  const manga = await Manga.findOne({ _id: req.params.mangaId, authorId: req.user!._id });
  if (!manga) { res.status(404).json({ error: 'Manga not found' }); return; }
  manga.publishStatus = 'published';
  if (!manga.publishedAt) manga.publishedAt = new Date();
  await manga.save();
  res.json({ manga });
}

export async function unpublishManga(req: AuthRequest, res: Response): Promise<void> {
  const manga = await Manga.findOne({ _id: req.params.mangaId, authorId: req.user!._id });
  if (!manga) { res.status(404).json({ error: 'Manga not found' }); return; }
  manga.publishStatus = 'draft';
  await manga.save();
  res.json({ manga });
}

// --- Likes ---

export async function likeManga(req: AuthRequest, res: Response): Promise<void> {
  const mangaId = String(req.params.mangaId);
  const manga = await Manga.findOne({ _id: mangaId, publishStatus: 'published' });
  if (!manga) { res.status(404).json({ error: 'Manga not found' }); return; }
  const existing = await Like.findOne({ userId: req.user!._id, mangaId });
  if (existing) { res.status(409).json({ error: 'Already liked' }); return; }
  await Like.create({ userId: req.user!._id, mangaId });
  await Manga.findByIdAndUpdate(mangaId, { $inc: { likesCount: 1 } });

  // Notification
  if (String(manga.authorId) !== String(req.user!._id)) {
    const notification = await Notification.create({
      recipientId: manga.authorId,
      senderId: req.user!._id,
      type: NotificationType.LIKE,
      mangaId: manga._id,
      text: `${req.user!.displayName} liked your manga: ${manga.title}`,
    });
    const populated = await notification.populate('senderId', 'username displayName avatarUrl');
    emitToUser(String(manga.authorId), 'notification', populated);
  }

  res.json({ liked: true });
}

export async function unlikeManga(req: AuthRequest, res: Response): Promise<void> {
  const { mangaId } = req.params;
  const like = await Like.findOneAndDelete({ userId: req.user!._id, mangaId });
  if (!like) { res.status(404).json({ error: 'Not liked' }); return; }
  await Manga.findByIdAndUpdate(mangaId, { $inc: { likesCount: -1 } });
  res.json({ liked: false });
}

export async function getLikes(req: AuthRequest, res: Response): Promise<void> {
  const manga = await Manga.findById(req.params.mangaId).select('likesCount');
  if (!manga) { res.status(404).json({ error: 'Manga not found' }); return; }
  const isLiked = req.user ? !!(await Like.findOne({ userId: req.user._id, mangaId: req.params.mangaId })) : false;
  res.json({ likesCount: manga.likesCount, isLiked });
}

// --- Comments ---

export async function getComments(req: AuthRequest, res: Response): Promise<void> {
  const { parentId } = req.query;
  const page = Number(req.query.page) || 1;
  const limit = 20;

  const query: any = { mangaId: req.params.mangaId, isDeleted: false };
  if (parentId) {
    query.parentId = parentId;
  } else {
    query.parentId = null;
  }

  const comments = await Comment.find(query)
    .populate('userId', 'username displayName avatarUrl')
    .sort({ createdAt: parentId ? 1 : -1 })
    .skip((page - 1) * limit)
    .limit(limit);

  // Get user interaction status
  let userActions: any[] = [];
  if (req.user) {
    userActions = await CommentAction.find({
      userId: req.user._id,
      commentId: { $in: comments.map(c => c._id) }
    });
  }

  const results = comments.map(c => {
    const action = userActions.find(a => String(a.commentId) === String(c._id));
    return {
      ...c.toObject(),
      userAction: action ? action.type : null
    };
  });

  res.json({ comments: results, page });
}

export async function addComment(req: AuthRequest, res: Response): Promise<void> {
  const { text, parentId } = req.body;
  if (!text?.trim()) { res.status(400).json({ error: 'Comment text required' }); return; }
  const manga = await Manga.findOne({ _id: req.params.mangaId, publishStatus: 'published' });
  if (!manga) { res.status(404).json({ error: 'Manga not found' }); return; }

  const mId = String(req.params.mangaId);
  const comment = await Comment.create({
    mangaId: mId,
    userId: req.user!._id,
    text: text.trim(),
    parentId: parentId || null
  });

  if (parentId) {
    await Comment.findByIdAndUpdate(parentId, { $inc: { repliesCount: 1 } });
  } else {
    await Manga.findByIdAndUpdate(mId, { $inc: { commentsCount: 1 } });
  }

  const populated = await comment.populate('userId', 'username displayName avatarUrl');

  // Notification (only for top-level comments or direct replies to others)
  const recipientId = parentId ? (await Comment.findById(parentId))?.userId : manga.authorId;
  if (recipientId && String(recipientId) !== String(req.user!._id)) {
    const notification = await Notification.create({
      recipientId,
      senderId: req.user!._id,
      type: parentId ? NotificationType.COMMENT : NotificationType.COMMENT, // Can differentiate later if needed
      mangaId: manga._id,
      commentId: comment._id,
      text: parentId 
        ? `${req.user!.displayName} replied to your comment`
        : `${req.user!.displayName} commented on your manga: ${manga.title}`,
    });
    const populatedNotif = await notification.populate('senderId', 'username displayName avatarUrl');
    emitToUser(String(recipientId), 'notification', populatedNotif);
  }

  // Real-time comments for all listeners
  emitToRoom(`series:comments:${mId}`, 'new_comment', {
    seriesId: mId,
    comment: populated,
  });

  res.status(201).json({ comment: populated });
}

export async function deleteComment(req: AuthRequest, res: Response): Promise<void> {
  const comment = await Comment.findOne({ _id: req.params.commentId, userId: req.user!._id });
  if (!comment) { res.status(404).json({ error: 'Comment not found' }); return; }
  comment.isDeleted = true;
  comment.deletedAt = new Date();
  await comment.save();
  if (comment.parentId) {
    await Comment.findByIdAndUpdate(comment.parentId, { $inc: { repliesCount: -1 } });
  } else {
    await Manga.findByIdAndUpdate(req.params.mangaId, { $inc: { commentsCount: -1 } });
  }
  res.json({ message: 'Comment deleted' });
}

export async function likeComment(req: AuthRequest, res: Response): Promise<void> {
  const commentId = String(req.params.commentId);
  const userId = req.user!._id;

  const existing = await CommentAction.findOne({ userId, commentId });
  const comment = await Comment.findById(commentId);
  if (!comment) { res.status(404).json({ error: 'Comment not found' }); return; }

  if (existing) {
    if (existing.type === CommentActionType.LIKE) {
      // Toggle off
      await CommentAction.findByIdAndDelete(existing._id);
      comment.likesCount = Math.max(0, comment.likesCount - 1);
    } else {
      // Switch from dislike to like
      existing.type = CommentActionType.LIKE;
      await existing.save();
      comment.likesCount += 1;
      comment.dislikesCount = Math.max(0, comment.dislikesCount - 1);
    }
  } else {
    // New like
    await CommentAction.create({ userId, commentId, type: CommentActionType.LIKE });
    comment.likesCount += 1;
  }

  await comment.save();

  // Notification for the comment author
  if (String(comment.userId) !== String(userId) && (!existing || existing.type === CommentActionType.DISLIKE)) {
    const notification = await Notification.create({
      recipientId: comment.userId,
      senderId: userId,
      type: NotificationType.COMMENT_LIKE,
      commentId: comment._id,
      mangaId: comment.mangaId,
      text: `${req.user!.displayName} liked your comment`,
    });
    const populatedNotif = await notification.populate('senderId', 'username displayName avatarUrl');
    emitToUser(String(comment.userId), 'notification', populatedNotif);
  }

  // Real-time update for everyone in the room
  emitToRoom(`series:comments:${comment.mangaId}`, 'comment_action_updated', {
    commentId: comment._id,
    likesCount: comment.likesCount,
    dislikesCount: comment.dislikesCount,
  });

  res.json({ likesCount: comment.likesCount, dislikesCount: comment.dislikesCount, userAction: existing?.type === CommentActionType.LIKE ? null : CommentActionType.LIKE });
}

export async function dislikeComment(req: AuthRequest, res: Response): Promise<void> {
  const commentId = String(req.params.commentId);
  const userId = req.user!._id;

  const existing = await CommentAction.findOne({ userId, commentId });
  const comment = await Comment.findById(commentId);
  if (!comment) { res.status(404).json({ error: 'Comment not found' }); return; }

  if (existing) {
    if (existing.type === CommentActionType.DISLIKE) {
      // Toggle off
      await CommentAction.findByIdAndDelete(existing._id);
      comment.dislikesCount = Math.max(0, comment.dislikesCount - 1);
    } else {
      // Switch from like to dislike
      existing.type = CommentActionType.DISLIKE;
      await existing.save();
      comment.dislikesCount += 1;
      comment.likesCount = Math.max(0, comment.likesCount - 1);
    }
  } else {
    // New dislike
    await CommentAction.create({ userId, commentId, type: CommentActionType.DISLIKE });
    comment.dislikesCount += 1;
  }

  await comment.save();

  // Notification for the comment author
  if (String(comment.userId) !== String(userId) && (!existing || existing.type === CommentActionType.LIKE)) {
    const notification = await Notification.create({
      recipientId: comment.userId,
      senderId: userId,
      type: NotificationType.COMMENT_DISLIKE,
      commentId: comment._id,
      mangaId: comment.mangaId,
      text: `${req.user!.displayName} disliked your comment`,
    });
    const populatedNotif = await notification.populate('senderId', 'username displayName avatarUrl');
    emitToUser(String(comment.userId), 'notification', populatedNotif);
  }

  // Real-time update for everyone in the room
  emitToRoom(`series:comments:${comment.mangaId}`, 'comment_action_updated', {
    commentId: comment._id,
    likesCount: comment.likesCount,
    dislikesCount: comment.dislikesCount,
  });

  res.json({ likesCount: comment.likesCount, dislikesCount: comment.dislikesCount, userAction: existing?.type === CommentActionType.DISLIKE ? null : CommentActionType.DISLIKE });
}

// --- Chapters ---

export async function createChapter(req: AuthRequest, res: Response): Promise<void> {
  const manga = await Manga.findOne({ _id: req.params.mangaId, authorId: req.user!._id });
  if (!manga) { res.status(404).json({ error: 'Manga not found' }); return; }
  const { title, notes } = req.body;
  if (!title) { res.status(400).json({ error: 'Title is required' }); return; }
  const lastChapter = await Chapter.findOne({ mangaId: manga._id }).sort({ chapterNumber: -1 });
  const chapterNumber = (lastChapter?.chapterNumber || 0) + 1;
  const chapter = await Chapter.create({ mangaId: manga._id, authorId: req.user!._id, title, chapterNumber, notes });
  await Manga.findByIdAndUpdate(manga._id, { $inc: { chapterCount: 1 } });
  res.status(201).json({ chapter });
}

export async function getChapters(req: AuthRequest, res: Response): Promise<void> {
  const manga = await Manga.findById(req.params.mangaId);
  if (!manga) { res.status(404).json({ error: 'Manga not found' }); return; }
  const isOwner = String(manga.authorId) === String(req.user?._id);
  const chapters = await Chapter.find({
    mangaId: manga._id,
    ...(!isOwner ? { publishStatus: 'published' } : {}),
  }).sort({ chapterNumber: 1 });
  res.json({ chapters });
}

export async function getChapter(req: AuthRequest, res: Response): Promise<void> {
  const chapter = await Chapter.findById(req.params.chapterId);
  if (!chapter) { res.status(404).json({ error: 'Chapter not found' }); return; }
  const manga = await Manga.findById(chapter.mangaId);
  if (!manga) { res.status(404).json({ error: 'Manga not found' }); return; }
  const isOwner = String(manga.authorId) === String(req.user?._id);
  if (chapter.publishStatus === 'draft' && !isOwner) {
    res.status(403).json({ error: 'Not authorized' }); return;
  }
  const panels = await Panel.find({ chapterId: chapter._id }).sort({ order: 1 });
  if (!isOwner) await Chapter.findByIdAndUpdate(chapter._id, { $inc: { viewsCount: 1 } });
  res.json({ chapter, panels });
}

export async function updateChapter(req: AuthRequest, res: Response): Promise<void> {
  const chapter = await Chapter.findOne({ _id: req.params.chapterId, authorId: req.user!._id });
  if (!chapter) { res.status(404).json({ error: 'Chapter not found' }); return; }
  const { title, notes } = req.body;
  if (title) chapter.title = title;
  if (notes !== undefined) chapter.notes = notes;
  await chapter.save();
  res.json({ chapter });
}

export async function deleteChapter(req: AuthRequest, res: Response): Promise<void> {
  const chapter = await Chapter.findOne({ _id: req.params.chapterId, authorId: req.user!._id });
  if (!chapter) { res.status(404).json({ error: 'Chapter not found' }); return; }
  await Panel.deleteMany({ chapterId: chapter._id });
  await Chapter.findByIdAndDelete(chapter._id);
  await Manga.findByIdAndUpdate(chapter.mangaId, { $inc: { chapterCount: -1 } });
  res.json({ message: 'Chapter deleted' });
}

export async function publishChapter(req: AuthRequest, res: Response): Promise<void> {
  const chapter = await Chapter.findOne({ _id: req.params.chapterId, authorId: req.user!._id });
  if (!chapter) { res.status(404).json({ error: 'Chapter not found' }); return; }
  
  chapter.publishStatus = 'published';
  chapter.publishedAt = new Date();
  await chapter.save();

  // Auto-publish the Manga series if it's still a draft
  const manga = await Manga.findById(chapter.mangaId);
  if (manga && manga.publishStatus === 'draft') {
    manga.publishStatus = 'published';
    if (!manga.publishedAt) manga.publishedAt = new Date();
    await manga.save();
  }

  await Manga.findByIdAndUpdate(chapter.mangaId, { $inc: { publishedChapterCount: 1 } });
  res.json({ chapter });
}

// --- Panels ---

export async function createPanel(req: AuthRequest, res: Response): Promise<void> {
  const chapter = await Chapter.findOne({ _id: req.params.chapterId, authorId: req.user!._id });
  if (!chapter) { res.status(404).json({ error: 'Chapter not found' }); return; }

  const { panelType, content, isAiGenerated, copilotLogId } = req.body;
  if (!panelType) { res.status(400).json({ error: 'panelType is required' }); return; }

  const isImagePanel = panelType === 'image';

  if (isImagePanel && !req.file) {
    res.status(400).json({ error: 'An image file is required for image panels' }); return;
  }
  if (!isImagePanel && !content?.text) {
    res.status(400).json({ error: 'content.text is required for non-image panels' }); return;
  }

  const panelContent = { ...(content || {}) };

  if (isImagePanel && req.file) {
    const uploaded = await uploadImage(req.file.buffer, 'panel', `${chapter.mangaId}/${chapter._id}`);
    panelContent.imageUrl = uploaded.url;
    panelContent.imagePublicId = uploaded.publicId;
  }

  const lastPanel = await Panel.findOne({ chapterId: chapter._id }).sort({ order: -1 });
  const order = (lastPanel?.order || 0) + 1;

  const panel = await Panel.create({
    chapterId: chapter._id,
    mangaId: chapter.mangaId,
    authorId: req.user!._id,
    order,
    panelType,
    content: panelContent,
    isAiGenerated: isAiGenerated || false,
    copilotLogId,
  });
  await Chapter.findByIdAndUpdate(chapter._id, { $inc: { panelCount: 1 } });
  res.status(201).json({ panel });
}

const VALID_PANEL_TYPES = new Set(['dialog', 'monologue', 'narration', 'action', 'image-placeholder', 'image']);

export async function createPanelsBatch(req: AuthRequest, res: Response): Promise<void> {
  const chapter = await Chapter.findOne({ _id: req.params.chapterId, authorId: req.user!._id });
  if (!chapter) { res.status(404).json({ error: 'Chapter not found' }); return; }
  const { panels, copilotLogId } = req.body;
  if (!Array.isArray(panels) || panels.length === 0) {
    res.status(400).json({ error: 'panels array required' }); return;
  }
  const lastPanel = await Panel.findOne({ chapterId: chapter._id }).sort({ order: -1 });
  let order = (lastPanel?.order || 0) + 1;
  const newPanels = panels.map((p: { panelType: string; content: { text: string; characterName?: string } }) => {
    // Clamp to a valid type so no single panel can fail validation and kill the rest
    const panelType = VALID_PANEL_TYPES.has(p.panelType) ? p.panelType : 'narration';
    return {
      chapterId: chapter._id,
      mangaId: chapter.mangaId,
      authorId: req.user!._id,
      order: order++,
      panelType,
      content: p.content,
      isAiGenerated: true,
      copilotLogId,
    };
  });
  // ordered: false → if one doc somehow still fails, the rest still insert
  const created = await Panel.insertMany(newPanels, { ordered: false });
  await Chapter.findByIdAndUpdate(chapter._id, { $inc: { panelCount: created.length } });
  res.status(201).json({ panels: created });
}

export async function bulkUploadPanels(req: AuthRequest, res: Response): Promise<void> {
  console.log('[BulkUpload] Request received | userId:', req.user!._id, '| chapterId:', req.params.chapterId);
  console.log('[BulkUpload] Content-Type:', req.headers['content-type']);

  const chapter = await Chapter.findOne({ _id: req.params.chapterId, authorId: req.user!._id });
  if (!chapter) {
    console.log('[BulkUpload] Chapter not found');
    res.status(404).json({ error: 'Chapter not found' }); return;
  }

  const files = req.files as any[];
  console.log('[BulkUpload] Files received by multer:', files?.length ?? 0);
  if (!files || files.length === 0) {
    console.log('[BulkUpload] No files — multer parsed 0. Check field name and Content-Type boundary.');
    res.status(400).json({ error: 'No files uploaded' }); return;
  }

  files.forEach((f, i) => {
    console.log(`[BulkUpload] File[${i}]:`, {
      originalname: f.originalname,
      mimetype: f.mimetype,
      size: f.size,
      bufferLength: f.buffer?.length,
    });
  });

  const lastPanel = await Panel.findOne({ chapterId: chapter._id }).sort({ order: -1 });
  let order = (lastPanel?.order || 0) + 1;
  console.log('[BulkUpload] Starting order:', order);

  const createdPanels = [];

  for (const file of files) {
    try {
      if (file.mimetype.startsWith('image/')) {
        console.log('[BulkUpload] Uploading image to Cloudinary:', file.originalname, `(${file.size} bytes)`);
        const uploaded = await uploadImage(file.buffer, 'panel', `${chapter.mangaId}/${chapter._id}`);
        console.log('[BulkUpload] Cloudinary upload success:', uploaded.url);
        const panel = await Panel.create({
          chapterId: chapter._id,
          mangaId: chapter.mangaId,
          authorId: req.user!._id,
          order: order++,
          panelType: 'image',
          content: {
            imageUrl: uploaded.url,
            imagePublicId: uploaded.publicId,
          },
        });
        createdPanels.push(panel);
      } else {
        // Extract text from supported document formats
        let textContent: string | null = null;

        if (file.mimetype === 'text/plain') {
          textContent = file.buffer.toString('utf-8');
        } else if (file.mimetype === 'application/pdf') {
          const pdfData = await pdfParse(file.buffer);
          textContent = pdfData.text;
        } else if (
          file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
          file.mimetype === 'application/msword'
        ) {
          const result = await mammoth.extractRawText({ buffer: file.buffer });
          textContent = result.value;
        } else {
          console.log('[bulkUpload] unsupported mimetype, skipping:', file.mimetype);
        }

        if (textContent) {
          const paragraphs = textContent.split(/\n\s*\n/).filter((p: string) => p.trim());
          for (const paragraph of paragraphs) {
            const panel = await Panel.create({
              chapterId: chapter._id,
              mangaId: chapter.mangaId,
              authorId: req.user!._id,
              order: order++,
              panelType: 'narration',
              content: { text: paragraph.trim().substring(0, 500) },
            });
            createdPanels.push(panel);
          }
        } else if (file.mimetype !== 'text/plain' && !file.mimetype.startsWith('image/')) {
          console.log('[bulkUpload] no text extracted from file');
        }
      }
    } catch (err: any) {
      console.error('[BulkUpload] FAILED to process file:', file.originalname);
      console.error('[BulkUpload] Error:', err?.message);
      console.error('[BulkUpload] Stack:', err?.stack?.split('\n')[1]);
      // continue — don't let one failed file abort the whole batch
    }
  }
  console.log('[BulkUpload] Done — panels created:', createdPanels.length, '/ files received:', files.length);

  await Chapter.findByIdAndUpdate(chapter._id, { $inc: { panelCount: createdPanels.length } });
  res.status(201).json({ panels: createdPanels });
}

export async function updatePanel(req: AuthRequest, res: Response): Promise<void> {
  const panel = await Panel.findOne({ _id: req.params.panelId, authorId: req.user!._id });
  if (!panel) { res.status(404).json({ error: 'Panel not found' }); return; }

  const { content, panelType } = req.body;

  if (req.file) {
    // Replace existing image — delete old one first
    if (panel.content.imagePublicId) {
      await deleteImage(panel.content.imagePublicId);
    }
    const uploaded = await uploadImage(req.file.buffer, 'panel', `${panel.mangaId}/${panel.chapterId}`);
    panel.content = {
      ...panel.content,
      imageUrl: uploaded.url,
      imagePublicId: uploaded.publicId,
    };
  }

  if (content) panel.content = { ...panel.content, ...content };
  if (panelType) panel.panelType = panelType;

  await panel.save();
  res.json({ panel });
}

export async function deletePanel(req: AuthRequest, res: Response): Promise<void> {
  const panel = await Panel.findOne({ _id: req.params.panelId, authorId: req.user!._id });
  if (!panel) { res.status(404).json({ error: 'Panel not found' }); return; }
  if (panel.content.imagePublicId) {
    await deleteImage(panel.content.imagePublicId);
  }
  await Panel.findByIdAndDelete(panel._id);
  await Chapter.findByIdAndUpdate(panel.chapterId, { $inc: { panelCount: -1 } });
  res.json({ message: 'Panel deleted' });
}

export async function reorderPanels(req: AuthRequest, res: Response): Promise<void> {
  const { panelIds } = req.body; // ordered array of panel IDs
  if (!Array.isArray(panelIds)) { res.status(400).json({ error: 'panelIds array required' }); return; }
  const updates = panelIds.map((id: string, index: number) =>
    Panel.updateOne({ _id: id, authorId: req.user!._id }, { order: index + 1 })
  );
  await Promise.all(updates);
  res.json({ message: 'Panels reordered' });
}
