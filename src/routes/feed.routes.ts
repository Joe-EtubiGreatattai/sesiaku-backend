import { Router } from 'express';
import * as feed from '../controllers/feed.controller';
import { authenticate, optionalAuthenticate } from '../middleware/auth.middleware';

const router = Router();

router.get('/trending', feed.getTrending);
router.get('/new-releases', feed.getNewReleases);
router.get('/following', authenticate, feed.getFollowingFeed);
router.get('/genres', feed.getGenres);
router.get('/genres/:genre', feed.getMangaByGenre);
router.get('/search', optionalAuthenticate, feed.search);

export default router;
