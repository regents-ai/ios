import type { NextFunction, Request, Response, RequestHandler } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

import { sendError } from './httpResponses.js';
import { trustedClientIp } from './ip.js';

type RateLimitRequest = Request & {
  rateLimit?: {
    resetTime?: Date;
  };
};

type RateLimitOptions = {
  windowMs?: number;
  max?: number;
};

const oneMinute = 60 * 1000;

export function clientIpKey(req: Request) {
  // On Fly.io the only trustworthy client IP is the Fly-Client-IP header set by
  // fly-proxy. X-Forwarded-For is client-spoofable (fly-proxy appends, keeping
  // the client-supplied leftmost entry), so it must never key rate limits.
  return ipKeyGenerator(trustedClientIp(req) || 'unknown');
}

function retryAfterSeconds(req: RateLimitRequest) {
  const resetTime = req.rateLimit?.resetTime?.getTime();
  if (!resetTime) {
    return '60';
  }

  return String(Math.max(1, Math.ceil((resetTime - Date.now()) / 1000)));
}

function rateLimitHandler(code: string, message: string) {
  return (req: RateLimitRequest, res: Response) => {
    if (!res.hasHeader('Retry-After')) {
      res.setHeader('Retry-After', retryAfterSeconds(req));
    }

    return sendError(res, 429, code, message);
  };
}

function createLimiter(
  options: Required<RateLimitOptions> & {
    code: string;
    message: string;
    keyGenerator: (req: Request) => string;
  }
): RequestHandler {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: options.keyGenerator,
    handler: rateLimitHandler(options.code, options.message),
  });
}

export function createPublicReadRateLimiter(options: RateLimitOptions = {}) {
  return createLimiter({
    windowMs: options.windowMs ?? oneMinute,
    max: options.max ?? 60,
    code: 'TooManyPublicRequests',
    message: 'Too many requests. Please try again shortly.',
    keyGenerator: clientIpKey,
  });
}

export function createPublicWriteRateLimiter(options: RateLimitOptions = {}) {
  return createLimiter({
    windowMs: options.windowMs ?? oneMinute,
    max: options.max ?? 10,
    code: 'TooManyPublicRequests',
    message: 'Too many requests. Please try again shortly.',
    keyGenerator: clientIpKey,
  });
}

export function createAuthenticatedReadRateLimiter(options: RateLimitOptions = {}) {
  return createLimiter({
    windowMs: options.windowMs ?? oneMinute,
    max: options.max ?? 300,
    code: 'TooManyAuthenticatedRequests',
    message: 'Too many requests. Please try again shortly.',
    keyGenerator: authenticatedKey,
  });
}

export function createAuthenticatedWriteRateLimiter(options: RateLimitOptions = {}) {
  return createLimiter({
    windowMs: options.windowMs ?? oneMinute,
    max: options.max ?? 60,
    code: 'TooManyAuthenticatedRequests',
    message: 'Too many requests. Please try again shortly.',
    keyGenerator: authenticatedKey,
  });
}

export function createWebhookRateLimiter(options: RateLimitOptions = {}) {
  return createLimiter({
    windowMs: options.windowMs ?? oneMinute,
    max: options.max ?? 100,
    code: 'TooManyWebhookRequests',
    message: 'Too many webhook requests. Please try again later.',
    keyGenerator: clientIpKey,
  });
}

export function createAuthenticatedApiRateLimiter(
  readLimiter = createAuthenticatedReadRateLimiter(),
  writeLimiter = createAuthenticatedWriteRateLimiter()
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (isPublicRoute(req)) {
      return next();
    }

    const limiter = req.method === 'GET' || req.method === 'HEAD' ? readLimiter : writeLimiter;
    return limiter(req, res, next);
  };
}

function authenticatedKey(req: Request) {
  return req.userId ? `user:${req.userId}` : clientIpKey(req);
}

function isPublicRoute(req: Request) {
  return (
    req.path === '/health' ||
    req.path === '/.well-known/jwks.json' ||
    req.path.startsWith('/webhooks') ||
    req.path === '/internal/mobile/message/push' ||
    req.path === '/push-tokens/ping'
  );
}
