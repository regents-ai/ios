const ALLOWED_PROXY_HOSTS = new Set([
  'api.cdp.coinbase.com',
  'api.developer.coinbase.com',
]);

const USER_SCOPED_PATH_PATTERNS = [
  /^\/onramp\/v1\/buy\/user\/([^/]+)\/transactions$/,
  /^\/onramp\/v1\/sell\/user\/([^/]+)\/transactions$/,
];

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
  for (const pattern of USER_SCOPED_PATH_PATTERNS) {
    const match = url.pathname.match(pattern);
    if (match?.[1]) {
      return decodeURIComponent(match[1]);
    }
  }

  return null;
}

export function validateProxyTarget(input: {
  targetUrl: string;
  currentUserId?: string | undefined;
}) {
  const url = new URL(input.targetUrl);

  if (url.protocol !== 'https:') {
    throw new Error('Only HTTPS proxy targets are allowed.');
  }

  if (!ALLOWED_PROXY_HOSTS.has(url.hostname)) {
    throw new Error(`Proxy target host is not allowed: ${url.hostname}`);
  }

  const scopedRef = readUserScopedRef(url);
  if (scopedRef) {
    if (!input.currentUserId) {
      throw new Error('Authenticated user is required for user-scoped proxy requests.');
    }

    if (scopedRef !== input.currentUserId) {
      throw new Error('You can only access your own Coinbase records.');
    }
  }

  return url;
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

export function summarizeProxyRequestLog(targetUrl: string, method: string | undefined, body: unknown) {
  const url = new URL(targetUrl);

  return {
    host: url.host,
    path: url.pathname,
    method: method || 'POST',
    body: summarizeBody(body),
  };
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
    transactionId: typeof data.transactionId === 'string' ? data.transactionId : null,
    keyCount: keys.length,
    keys,
  };
}
