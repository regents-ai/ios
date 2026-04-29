import type { NextFunction, Request, Response } from 'express';

import { sendError } from './httpResponses.js';
import { verifyPrivyAccessToken } from './identity.js';

const tokenCache = new Map<string, { userId: string; sessionId: string; expiresAt: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export async function validateAccessToken(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return sendError(res, 401, 'Unauthorized', 'Authentication required. Please sign in to continue.');
    }

    const cached = token ? tokenCache.get(token) : null;
    if (cached && cached.expiresAt > Date.now()) {
      req.userId = cached.userId;
      req.userData = {
        id: cached.userId,
        sessionId: cached.sessionId,
      };
      return next();
    }

    const verified = await verifyPrivyAccessToken(token!);

    tokenCache.set(token!, {
      userId: verified.user_id,
      sessionId: verified.session_id,
      expiresAt: Date.now() + CACHE_TTL,
    });

    req.userId = verified.user_id;
    req.userData = {
      id: verified.user_id,
      sessionId: verified.session_id,
    };

    next();
  } catch (error) {
    console.error('❌ [AUTH] Token validation error:', error);
    return sendError(res, 401, 'Unauthorized', 'Your session is no longer valid. Please sign in again.');
  }
}

setInterval(() => {
  const now = Date.now();
  for (const [token, data] of tokenCache.entries()) {
    if (data.expiresAt <= now) {
      tokenCache.delete(token);
    }
  }
}, 10 * 60 * 1000);
