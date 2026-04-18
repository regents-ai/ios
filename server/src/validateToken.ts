import type { NextFunction, Request, Response } from 'express';

import { verifyPrivyAccessToken } from './identity.js';

const TESTFLIGHT_EMAIL = 'reviewer@regents-mobile.app';
const TESTFLIGHT_PHONE = '+12345678901';
const TESTFLIGHT_USER_ID = '286ef934-f3b8-4e94-b61f-1f1a088ac95e';

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
    const isTestFlightToken = token?.includes('testflight');
    const isTestFlightEmail = req.body?.email === TESTFLIGHT_EMAIL;
    const isTestFlightPhone = req.body?.phoneNumber === TESTFLIGHT_PHONE;
    const isTestFlightUserId = req.body?.url?.includes(TESTFLIGHT_USER_ID);

    if (isTestFlightToken || isTestFlightEmail || isTestFlightPhone || isTestFlightUserId) {
      req.userId = 'testflight-reviewer';
      req.userData = {
        id: 'testflight-reviewer',
        sessionId: 'testflight-reviewer',
        testAccount: true,
      };
      return next();
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required. Please sign in to continue.',
      });
    }

    const cached = token ? tokenCache.get(token) : null;
    if (cached && cached.expiresAt > Date.now()) {
      req.userId = cached.userId;
      req.userData = {
        id: cached.userId,
        sessionId: cached.sessionId,
        testAccount: false,
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
      testAccount: false,
    };

    next();
  } catch (error) {
    console.error('❌ [AUTH] Token validation error:', error);
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Your session is no longer valid. Please sign in again.',
    });
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
