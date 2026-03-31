import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';

/**
 * Returns the currently authenticated user from MongoDB.
 * The sync logic is handled by the authenticate middleware.
 */
export async function getMe(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  res.json({ user: req.user });
}

/**
 * Optional: Explicit sync endpoint if needed.
 */
export async function sync(req: AuthRequest, res: Response): Promise<void> {
  // Middelware already did the sync
  res.json({ user: req.user, message: 'Sync successful' });
}
