import { randomUUID } from 'node:crypto';
import type { Response } from 'express';

export type ErrorEnvelope = {
  error: {
    code: string;
    product: 'ios';
    status: number;
    path: string;
    request_id: string | null;
    message: string;
    next_steps: string | null;
  };
};

export function errorEnvelope(
  statusCode: number,
  path: string,
  requestId: string | null,
  code: string,
  message: string
): ErrorEnvelope {
  return {
    error: {
      code,
      product: 'ios',
      status: statusCode,
      path,
      request_id: requestId,
      message,
      next_steps: null,
    },
  };
}

export function sendError(res: Response, statusCode: number, code: string, message: string) {
  const headerRequestId = res.req.header('x-request-id')?.trim();
  const requestId = headerRequestId && headerRequestId.length > 0 ? headerRequestId : randomUUID();

  res.setHeader('x-request-id', requestId);

  return res
    .status(statusCode)
    .json(errorEnvelope(statusCode, res.req.path, requestId, code, message));
}
