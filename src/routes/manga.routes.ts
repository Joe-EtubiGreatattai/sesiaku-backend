import { Router } from 'express';
import * as manga from '../controllers/manga.controller';
import { authenticate, optionalAuthenticate } from '../middleware/auth.middleware';
import { checkSeriesLimit, checkChapterLimit } from '../middleware/subscription.middleware';

const router = Router();

// Series
router.post('/', authenticate, checkSeriesLimit, manga.upload.single('cover'), manga.createManga);
router.get('/:mangaId', optionalAuthenticate, manga.getManga);
router.patch('/:mangaId', authenticate, manga.upload.single('cover'), manga.updateManga);
router.delete('/:mangaId', authenticate, manga.deleteManga);
router.post('/:mangaId/publish', authenticate, manga.publishManga);
router.post('/:mangaId/unpublish', authenticate, manga.unpublishManga);

// Likes
router.post('/:mangaId/like', authenticate, manga.likeManga);
router.delete('/:mangaId/like', authenticate, manga.unlikeManga);
router.get('/:mangaId/likes', optionalAuthenticate, manga.getLikes);

// Comments
router.get('/:mangaId/comments', optionalAuthenticate, manga.getComments);
router.post('/:mangaId/comments', authenticate, manga.addComment);
router.post('/:mangaId/comments/:commentId/like', authenticate, manga.likeComment);
router.post('/:mangaId/comments/:commentId/dislike', authenticate, manga.dislikeComment);
router.delete('/:mangaId/comments/:commentId', authenticate, manga.deleteComment);

// Chapters
router.post('/:mangaId/chapters', authenticate, checkChapterLimit, manga.createChapter);
router.get('/:mangaId/chapters', optionalAuthenticate, manga.getChapters);
router.get('/:mangaId/chapters/:chapterId', optionalAuthenticate, manga.getChapter);
router.patch('/:mangaId/chapters/:chapterId', authenticate, manga.updateChapter);
router.delete('/:mangaId/chapters/:chapterId', authenticate, manga.deleteChapter);
router.post('/:mangaId/chapters/:chapterId/publish', authenticate, manga.publishChapter);

// Panels
router.post('/:mangaId/chapters/:chapterId/panels', authenticate, manga.panelUpload.single('image'), manga.createPanel);
router.post('/:mangaId/chapters/:chapterId/panels/batch', authenticate, manga.createPanelsBatch);
router.post('/:mangaId/chapters/:chapterId/panels/bulk', authenticate, manga.panelUpload.array('files', 50), manga.bulkUploadPanels);
// reorder must be before /:panelId — otherwise Express matches 'reorder' as a panel ID
router.patch('/:mangaId/chapters/:chapterId/panels/reorder', authenticate, manga.reorderPanels);
router.patch('/:mangaId/chapters/:chapterId/panels/:panelId', authenticate, manga.panelUpload.single('image'), manga.updatePanel);
router.delete('/:mangaId/chapters/:chapterId/panels/:panelId', authenticate, manga.deletePanel);

export default router;
