import { Router } from 'express';
import * as users from '../controllers/user.controller';
import { authenticate, optionalAuthenticate } from '../middleware/auth.middleware';

const router = Router();

router.get('/me', authenticate, users.getMe);
router.patch('/me', authenticate, users.upload.single('avatar'), users.updateMe);
router.delete('/me', authenticate, users.deleteMe);
router.get('/me/usage', authenticate, users.getUsage);
router.get('/:userId', users.getUser);
router.post('/:userId/follow', authenticate, users.followUser);
router.delete('/:userId/follow', authenticate, users.unfollowUser);
router.get('/:userId/followers', users.getFollowers);
router.get('/:userId/following', users.getFollowing);
router.get('/:userId/manga', optionalAuthenticate, users.getUserManga);

export default router;
