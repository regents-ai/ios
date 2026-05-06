import { createHash } from 'node:crypto';

export const COINBASE_PROXY_OPERATIONS = [
  'buy_config',
  'buy_options',
  'buy_transactions',
  'sell_transactions',
  'onramp_session',
  'onramp_order',
  'onramp_limits',
  'offramp_token',
] as const;

export type CoinbaseProxyOperation = typeof COINBASE_PROXY_OPERATIONS[number];

type ProxyParams = Record<string, string | number | boolean>;

export type CoinbaseProxyBuildInput = {
  operation: CoinbaseProxyOperation;
  body?: Record<string, unknown> | undefined;
  clientIp?: string | undefined;
  currentUserId?: string | undefined;
  params?: ProxyParams | undefined;
  partnerUserRef?: string | undefined;
};

export type BuiltCoinbaseProxyRequest = {
  body?: Record<string, unknown> | undefined;
  idempotencyRequired: boolean;
  method: 'GET' | 'POST';
  operation: CoinbaseProxyOperation;
  url: URL;
};

const IDEMPOTENT_COINBASE_PROXY_OPERATIONS = new Set<CoinbaseProxyOperation>([
  'onramp_order',
  'onramp_session',
]);

const DEVELOPER_HOST = 'api.developer.coinbase.com';
const CDP_HOST = 'api.cdp.coinbase.com';

export class CoinbaseConfigurationError extends Error {
  statusCode = 503;
  code = 'CoinbaseProxyUnavailable';

  constructor() {
    super('Adding cash is not available for this build yet.');
  }
}

export function requireCoinbaseApiCredentials(env: Record<string, string | undefined>) {
  const apiKeyId = env.CDP_API_KEY_ID?.trim();
  const apiKeySecret = env.CDP_API_KEY_SECRET?.trim();

  if (!apiKeyId || !apiKeySecret) {
    throw new CoinbaseConfigurationError();
  }

  return { apiKeyId, apiKeySecret };
}

function readUserScopedRef(url: URL) {
  const match = url.pathname.match(/^\/onramp\/v1\/(?:buy|sell)\/user\/([^/]+)\/transactions$/);
  if (match?.[1]) {
    return decodeURIComponent(match[1]);
  }

  return null;
}

function requireCurrentUser(currentUserId: string | undefined) {
  if (!currentUserId?.trim()) {
    throw new Error('Authenticated user is required for this Coinbase request.');
  }

  return currentUserId.trim();
}

function requireMatchingPartnerUserRef(input: {
  currentUserId?: string | undefined;
  partnerUserRef?: string | undefined;
}) {
  const currentUserId = requireCurrentUser(input.currentUserId);
  const partnerUserRef = input.partnerUserRef?.trim();

  if (!partnerUserRef) {
    throw new Error('A partner user reference is required for this Coinbase request.');
  }

  if (partnerUserRef !== currentUserId) {
    throw new Error('You can only access your own Coinbase records.');
  }

  return currentUserId;
}

function assertBodyUserRefMatchesCurrentUser(body: Record<string, unknown> | undefined, currentUserId: string) {
  const bodyUserRef = body?.partnerUserRef;
  if (bodyUserRef !== undefined && bodyUserRef !== currentUserId) {
    throw new Error('You can only create Coinbase requests for your own account.');
  }
}

function appendAllowedParams(
  url: URL,
  params: ProxyParams | undefined,
  allowedKeys: readonly string[],
  defaults?: ProxyParams
) {
  const merged = {
    ...(defaults || {}),
    ...(params || {}),
  };
  const allowed = new Set(allowedKeys);

  for (const [key, value] of Object.entries(merged)) {
    if (!allowed.has(key)) {
      throw new Error(`Coinbase proxy parameter is not allowed: ${key}`);
    }

    url.searchParams.set(key, String(value));
  }
}

function postBody(body: Record<string, unknown> | undefined, clientIp: string | undefined) {
  return {
    ...(body || {}),
    ...(clientIp ? { clientIp } : {}),
  };
}

export function buildCoinbaseProxyRequest(input: CoinbaseProxyBuildInput): BuiltCoinbaseProxyRequest {
  switch (input.operation) {
    case 'buy_config':
      return {
        idempotencyRequired: false,
        method: 'GET',
        operation: input.operation,
        url: new URL(`https://${DEVELOPER_HOST}/onramp/v1/buy/config`),
      };

    case 'buy_options': {
      const url = new URL(`https://${DEVELOPER_HOST}/onramp/v1/buy/options`);
      appendAllowedParams(url, input.params, ['country', 'subdivision']);
      return {
        idempotencyRequired: false,
        method: 'GET',
        operation: input.operation,
        url,
      };
    }

    case 'buy_transactions': {
      const partnerUserRef = requireMatchingPartnerUserRef(input);
      const url = new URL(`https://${DEVELOPER_HOST}/onramp/v1/buy/user/${encodeURIComponent(partnerUserRef)}/transactions`);
      appendAllowedParams(url, input.params, ['pageKey', 'pageSize'], { pageSize: 10 });
      return {
        idempotencyRequired: false,
        method: 'GET',
        operation: input.operation,
        url,
      };
    }

    case 'sell_transactions': {
      const partnerUserRef = requireMatchingPartnerUserRef(input);
      const url = new URL(`https://${DEVELOPER_HOST}/onramp/v1/sell/user/${encodeURIComponent(partnerUserRef)}/transactions`);
      appendAllowedParams(url, input.params, ['pageKey', 'pageSize']);
      return {
        idempotencyRequired: false,
        method: 'GET',
        operation: input.operation,
        url,
      };
    }

    case 'onramp_session': {
      const currentUserId = requireMatchingPartnerUserRef(input);
      assertBodyUserRefMatchesCurrentUser(input.body, currentUserId);
      return {
        body: postBody(input.body, input.clientIp),
        idempotencyRequired: true,
        method: 'POST',
        operation: input.operation,
        url: new URL(`https://${CDP_HOST}/platform/v2/onramp/sessions`),
      };
    }

    case 'onramp_order': {
      const currentUserId = requireMatchingPartnerUserRef(input);
      assertBodyUserRefMatchesCurrentUser(input.body, currentUserId);
      return {
        body: postBody(input.body, input.clientIp),
        idempotencyRequired: true,
        method: 'POST',
        operation: input.operation,
        url: new URL(`https://${CDP_HOST}/platform/v2/onramp/orders`),
      };
    }

    case 'onramp_limits':
      return {
        body: postBody(input.body, input.clientIp),
        idempotencyRequired: false,
        method: 'POST',
        operation: input.operation,
        url: new URL(`https://${CDP_HOST}/platform/v2/onramp/limits`),
      };

    case 'offramp_token': {
      const currentUserId = requireMatchingPartnerUserRef(input);
      assertBodyUserRefMatchesCurrentUser(input.body, currentUserId);
      return {
        body: postBody(input.body, input.clientIp),
        idempotencyRequired: false,
        method: 'POST',
        operation: input.operation,
        url: new URL(`https://${DEVELOPER_HOST}/onramp/v1/token`),
      };
    }
  }

  const operation: never = input.operation;
  throw new Error(`Coinbase proxy operation is not allowed: ${operation}`);
}

export function validateBuiltProxyTarget(input: BuiltCoinbaseProxyRequest) {
  if (input.url.protocol !== 'https:') {
    throw new Error('Only HTTPS proxy targets are allowed.');
  }

  if (input.url.hostname !== CDP_HOST && input.url.hostname !== DEVELOPER_HOST) {
    throw new Error(`Proxy target host is not allowed: ${input.url.hostname}`);
  }

  const scopedRef = readUserScopedRef(input.url);
  const encodedScopedRef = input.url.pathname.split('/')[5];
  if (scopedRef && encodedScopedRef && scopedRef !== decodeURIComponent(encodedScopedRef)) {
    throw new Error('Coinbase user-scoped path is malformed.');
  }

  return input.url;
}

function summarizeBody(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const keys = Object.keys(value as Record<string, unknown>).sort();
  return {
    keyCount: keys.length,
    keys,
  };
}

export function summarizeProxyRequestLog(input: BuiltCoinbaseProxyRequest) {
  return {
    operation: input.operation,
    host: input.url.host,
    path: input.url.pathname,
    method: input.method,
    body: summarizeBody(input.body),
  };
}

export function requiresCoinbaseProxyIdempotency(operation: CoinbaseProxyOperation) {
  return IDEMPOTENT_COINBASE_PROXY_OPERATIONS.has(operation);
}

export function summarizeProxyResponseLog(data: unknown) {
  if (Array.isArray(data)) {
    return {
      kind: 'array',
      itemCount: data.length,
    };
  }

  if (!data || typeof data !== 'object') {
    return {
      kind: typeof data,
    };
  }

  const record = data as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const summary: Record<string, unknown> = {
    kind: 'object',
    keyCount: keys.length,
    keys,
  };

  if (Array.isArray(record.transactions)) {
    summary.transactionCount = record.transactions.length;
  }

  if (Array.isArray(record.limits)) {
    summary.limitCount = record.limits.length;
  }

  if (Array.isArray(record.countries)) {
    summary.countryCount = record.countries.length;
  }

  if (record.quote && typeof record.quote === 'object') {
    summary.quoteKeys = Object.keys(record.quote as Record<string, unknown>).sort();
  }

  return summary;
}

export function summarizeCoinbaseErrorResponse(input: {
  bodyText: string;
  contentType: string | null;
  status: number;
  statusText: string;
}) {
  const summary: Record<string, unknown> = {
    status: input.status,
    statusText: input.statusText,
    contentType: input.contentType || 'unknown',
    bodyLength: input.bodyText.length,
  };

  if (input.contentType?.includes('application/json')) {
    try {
      const parsed = JSON.parse(input.bodyText) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const keys = Object.keys(parsed as Record<string, unknown>).sort();
        summary.body = {
          kind: 'object',
          keyCount: keys.length,
          keys,
        };
      } else if (Array.isArray(parsed)) {
        summary.body = {
          kind: 'array',
          itemCount: parsed.length,
        };
      } else {
        summary.body = {
          kind: typeof parsed,
        };
      }
    } catch {
      summary.body = {
        kind: 'unreadable-json',
      };
    }
  }

  return summary;
}

export function requireWebhookSecret(secret: string | undefined) {
  if (!secret?.trim()) {
    throw new Error('WEBHOOK_SECRET is required for webhook verification.');
  }

  return secret;
}

export function summarizeWebhookLog(data: Record<string, unknown>) {
  const keys = Object.keys(data).sort();

  return {
    eventType: typeof data.eventType === 'string' ? data.eventType : 'unknown',
    transactionIdHash: typeof data.transactionId === 'string' ? hashLogIdentifier(data.transactionId) : null,
    partnerUserRefHash: typeof data.partnerUserRef === 'string' ? hashLogIdentifier(data.partnerUserRef) : null,
    keyCount: keys.length,
    keys,
  };
}

function hashLogIdentifier(value: string) {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}
