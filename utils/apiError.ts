/**
 * Humanized API error taxonomy.
 *
 * Adapted from hermex APIError.swift: every backend failure is classified
 * into a small set of kinds, each with what-to-do copy, plus a privacy-safe
 * log category that never carries user data.
 *
 * Copy rule: never claim a transaction state (sent, failed, refunded) unless
 * it is provable — money copy only tells people how to verify.
 */

export type ApiFailureKind =
  | 'network'
  | 'auth'
  | 'permission'
  | 'not-found'
  | 'rate-limited'
  | 'server'
  | 'invalid-response'
  | 'unknown';

export class ApiError extends Error {
  readonly kind: ApiFailureKind;
  readonly status: number | null;

  constructor(kind: ApiFailureKind, message: string, status: number | null = null) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
  }
}

export function apiFailureKindForStatus(status: number): ApiFailureKind {
  if (status === 401) return 'auth';
  if (status === 403) return 'permission';
  if (status === 404) return 'not-found';
  if (status === 429) return 'rate-limited';
  if (status >= 500) return 'server';
  if (status >= 400) return 'unknown';
  return 'invalid-response';
}

const FAILURE_COPY: Record<ApiFailureKind, { title: string; message: string }> = {
  network: {
    title: 'No connection',
    message: 'Check your internet connection, then try again.',
  },
  auth: {
    title: 'Sign in to continue',
    message: 'Your session ended. Sign in again to pick up where you left off.',
  },
  permission: {
    title: 'You do not have access to this',
    message: 'This account cannot open that. Switch accounts or contact support.',
  },
  'not-found': {
    title: 'That is no longer here',
    message: 'It may have moved or been removed. Go back and try again.',
  },
  'rate-limited': {
    title: 'Too many attempts',
    message: 'Wait a moment, then try again.',
  },
  server: {
    title: 'Something went wrong on our side',
    message:
      'Try again in a few minutes. If money was moving, check your recent activity before retrying.',
  },
  'invalid-response': {
    title: 'We got an unexpected reply',
    message: 'Try again in a moment. If it keeps happening, contact support.',
  },
  unknown: {
    title: 'That did not work',
    message: 'Try again in a moment. If it keeps happening, contact support.',
  },
};

function asApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  // fetch rejects with a TypeError when the network is unreachable.
  if (error instanceof TypeError) {
    return new ApiError('network', FAILURE_COPY.network.message);
  }

  return new ApiError('unknown', FAILURE_COPY.unknown.message);
}

/**
 * One humanized description for any failure: a short title plus what-to-do
 * copy. A server-provided message on an `ApiError` wins over the generic
 * copy for its kind — the backend contract only sends user-facing messages.
 */
export function describeApiError(error: unknown): { title: string; message: string } {
  const apiError = asApiError(error);
  const copy = FAILURE_COPY[apiError.kind];
  const message = error instanceof ApiError && apiError.message ? apiError.message : copy.message;
  return { title: copy.title, message };
}

/**
 * A log label that is safe to emit anywhere: kind plus HTTP status only.
 * Never includes the error message, URL, or payload — those can carry
 * addresses, amounts, names, and other user data.
 */
export function privacySafeLogCategory(error: unknown): string {
  const apiError = asApiError(error);
  return apiError.status === null ? `api.${apiError.kind}` : `api.${apiError.kind}.${apiError.status}`;
}
