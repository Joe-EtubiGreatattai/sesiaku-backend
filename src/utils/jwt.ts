import jwt from 'jsonwebtoken';
import crypto from 'crypto';

export function generateAccessToken(userId: string): string {
  return jwt.sign({ userId }, process.env.JWT_SECRET!, {
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
  } as jwt.SignOptions);
}

export function generateRefreshToken(userId: string): string {
  return jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET!, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  } as jwt.SignOptions);
}

export function verifyRefreshToken(token: string): { userId: string } {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET!) as { userId: string };
}

export function generateSecureToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
