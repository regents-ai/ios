import type { NextFunction, Request, Response } from 'express';

import { sendError } from './httpResponses.js';
import { summarizeErrorLog } from './security.js';

/**
 * Raised by the CORS origin check so the final error handler can answer with
 * the standard error envelope instead of Express's default HTML 500 page.
 */
export class CorsOriginError extends Error {
  constructor() {
    super('Origin is not allowed.');
    this.name = 'CorsOriginError';
  }
}

function clientErrorStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) {
    return null;
  }

  const candidate =
    (error as { status?: unknown }).status ?? (error as { statusCode?: unknown }).statusCode;

  if (typeof candidate === 'number' && Number.isInteger(candidate) && candidate >= 400 && candidate < 500) {
    return candidate;
  }

  return null;
}

/**
 * Final Express error handler: every error that reaches it leaves as the
 * standard error envelope with a stable, client-safe message. Details stay in
 * the server log only.
 */
export function createErrorHandler() {
  return (error: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      return next(error);
    }

    if (error instanceof CorsOriginError) {
      return sendError(res, 403, 'Forbidden', 'This origin is not allowed to call this API.');
    }

    // Body-parser and similar middleware attach a 4xx status (e.g. malformed
    // JSON). Keep the status, replace the internal message.
    const status = clientErrorStatus(error);
    if (status !== null) {
      return sendError(res, status, 'BadRequest', 'The request could not be processed.');
    }

    console.error('❌ [HTTP] Unhandled request error:', summarizeErrorLog(error));
    return sendError(res, 500, 'InternalError', 'Something went wrong. Please try again.');
  };
}
