import { Request, Response, NextFunction } from 'express';
import { createClerkClient, verifyToken } from '@clerk/backend';
import User, { IUser } from '../models/User.model';

const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

export interface AuthRequest extends Request {
  user?: IUser;
  auth?: {
    userId: string;
    sessionId?: string;
  };
}

/**
 * Middleware to authenticate requests using Clerk.
 * It verifies the Clerk JWT and synchronizes the Clerk user with our local MongoDB User model.
 */
export async function authenticate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No authentication token provided' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    // 1. Verify the Clerk JWT
    const decodedToken = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
    const clerkUserId = decodedToken.sub;

    // 2. Find or synchronize the user with our local MongoDB
    let user = await User.findOne({ clerkId: clerkUserId });

    if (!user) {
      console.log(`[Auth] User ${clerkUserId} not found in DB. Attempting to sync from Clerk...`);
      // Sync from Clerk if user doesn't exist in our DB yet
      try {
        const clerkUser = await clerkClient.users.getUser(clerkUserId);
        console.log(`[Auth] Fetched Clerk user:`, JSON.stringify({
          id: clerkUser.id,
           emailAddresses: clerkUser.emailAddresses,
           unsafeMetadata: clerkUser.unsafeMetadata,
           username: clerkUser.username,
           firstName: clerkUser.firstName,
           lastName: clerkUser.lastName
        }, null, 2));

        const email = clerkUser.emailAddresses[0]?.emailAddress || '';
        
        // Check unsafeMetadata first (from our custom registration), then fall back
        const customUsername = clerkUser.unsafeMetadata?.username as string | undefined;
        const customDisplayName = clerkUser.unsafeMetadata?.displayName as string | undefined;
        console.log(`[Auth] Extracted unsafeMetadata: customUsername=${customUsername || 'none'}, customDisplayName=${customDisplayName || 'none'}`);

        const username = customUsername || clerkUser.username || email.split('@')[0] || `user_${clerkUserId.slice(-6)}`;
        const displayName = customDisplayName || `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim() || username;
        console.log(`[Auth] Final computed values: username=${username}, displayName=${displayName}`);

        // Check if a user with this email already exists but has no/different clerkId
        let existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
          existingUser.clerkId = clerkUserId;
          user = await existingUser.save();
          console.log(`[Auth] User already existed by email! Updated clerkId for DB user ID: ${user._id}`);
        } else {
          user = await User.create({
            clerkId: clerkUserId,
            email: email.toLowerCase(),
            username: username.toLowerCase().replace(/[^a-z0-9_]/g, ''),
            displayName,
            avatarUrl: clerkUser.imageUrl,
            isEmailVerified: true, // Clerk handles verification
          });
          console.log(`[Auth] Successfully created local DB user! ID: ${user._id}`);
        }
      } catch (syncErr) {
        console.error('[Auth] Clerk User Sync Error:', syncErr);
        res.status(500).json({ error: 'Failed to synchronize user account' });
        return;
      }
    }

    req.user = user;
    req.auth = { userId: clerkUserId };
    next();
  } catch (err) {
    console.error('Clerk Auth Error:', err);
    res.status(401).json({ error: 'Invalid or expired session' });
  }
}

/**
 * Optional authentication middleware.
 * Doesn't fail if the token is missing or invalid.
 */
export async function optionalAuthenticate(req: AuthRequest, _res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    next();
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const decodedToken = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
    const clerkUserId = decodedToken.sub;
    
    let user = await User.findOne({ clerkId: clerkUserId });
    if (user) {
      req.user = user;
      req.auth = { userId: clerkUserId };
    }
  } catch {
    // Silently ignore errors for optional auth
  }
  next();
}
