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
  | 'wallet-cancelled'
  | 'wallet-fee-shortfall'
  | 'wallet'
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
    title: 'Something went wrong',
    message: 'Try again in a moment. If it keeps happening, contact support.',
  },
  'wallet-cancelled': {
    title: 'Cancelled in your wallet',
    message: 'You cancelled in your wallet, so nothing was sent.',
  },
  'wallet-fee-shortfall': {
    title: 'Not enough ETH for the network fee',
    message: 'Your wallet needs a little ETH on this network to pay the fee. Add some, then try again.',
  },
  wallet: {
    title: 'Your wallet could not send this',
    message: 'Your wallet did not send this. Check the wallet, then try again.',
  },
  unknown: {
    title: 'That did not work',
    message: 'Try again in a moment. If it keeps happening, contact support.',
  },
};

const WALLET_CANCELLED = /user rejected|user denied|rejected the request|cancelled by user|canceled by user/i;
const WALLET_FEE_SHORTFALL = /AA21|didn't pay prefund|did not pay prefund|insufficient funds|insufficient balance|exceeds transaction sender account balance/i;
const WALLET_SEND = /user ?operation|bundler|paymaster|smart account|entry ?point|AA\d\d/i;

/** Every message along the error's cause chain, so wallet and bundler text is seen wherever it sits. */
function errorText(error: unknown, depth = 0): string {
  if (depth > 5 || error === null || typeof error !== 'object') {
    return typeof error === 'string' ? error : '';
  }

  const record = error as { message?: unknown; details?: unknown; shortMessage?: unknown; cause?: unknown };
  return [record.message, record.shortMessage, record.details]
    .filter((part): part is string => typeof part === 'string')
    .concat(errorText(record.cause, depth + 1))
    .join('\n');
}

/**
 * A failure raised by the user's wallet while sending, classified from the
 * wallet's own error: a cancellation (EIP-1193 code 4001), a fee shortfall
 * reported by the bundler, or another wallet-side refusal.
 */
function asWalletError(error: unknown): ApiError | null {
  if (error === null || typeof error !== 'object') {
    return null;
  }

  const code = (error as { code?: unknown }).code;
  const text = errorText(error);
  if (code === 4001 || WALLET_CANCELLED.test(text)) {
    return new ApiError('wallet-cancelled', FAILURE_COPY['wallet-cancelled'].message);
  }
  if (WALLET_FEE_SHORTFALL.test(text)) {
    return new ApiError('wallet-fee-shortfall', FAILURE_COPY['wallet-fee-shortfall'].message);
  }
  if (WALLET_SEND.test(text)) {
    return new ApiError('wallet', FAILURE_COPY.wallet.message);
  }

  return null;
}

function asApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  const walletError = asWalletError(error);
  if (walletError) {
    return walletError;
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
