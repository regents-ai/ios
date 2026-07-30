import cors from 'cors';
import express from 'express';
import { z } from 'zod';

import { generateJwt } from '@coinbase/cdp-sdk/auth';
import { CorsOriginError, createErrorHandler } from './errorHandling.js';
import { checkReadiness } from './health.js';
import { sendError } from './httpResponses.js';
import { createCdpCustomAuthToken, getCdpJwks } from './identity.js';
import { resolveClientIp } from './ip.js';
import {
  createHttpMetricsMiddleware,
  metricsHandler,
  mobilePushRegistrationsTotal,
  mobileWalletOpenedTotal,
  recordTransactionWebhookOutcome,
} from './metrics.js';
import { isReleaseRuntime } from './runtime.js';
import { createMobileRoutes } from './mobileRoutes.js';
import { createPortalPairingRoutes } from './routes/portalPairing.js';
import { processMobileMessagePushRequest } from './mobileMessagePush.js';
import {
  createApnsProviderFromEnv,
  sendPushNotification,
  type PushTokenRecord,
} from './pushDelivery.js';
import {
  claimTransactionWebhookEvent,
  markTransactionWebhookEventProcessed,
  parseCanonicalTransactionWebhook,
  releaseTransactionWebhookEventClaim,
  TRANSACTION_WEBHOOK_PROCESSING_LEASE_SECONDS,
} from './onrampWebhook.js';
import {
  ingestTransactionWebhook,
  listTransactionEvents,
} from './transactionEventFeed.js';
import {
  buildPushTokenDebugResponse,
  canAccessPushTokenDebug,
} from './pushTokens.js';
import {
  buildCoinbaseProxyRequest,
  COINBASE_PROXY_OPERATIONS,
  requireWebhookSecret,
  requiresCoinbaseProxyIdempotency,
  summarizeCoinbaseErrorResponse,
  summarizeErrorLog,
  summarizePushRegistrationAttemptLog,
  summarizePushTokenRegistrationLog,
  summarizePushTokenUserLog,
  summarizeWebhookLog,
  summarizeProxyRequestLog,
  summarizeProxyResponseLog,
  validateBuiltProxyTarget,
  CoinbaseConfigurationError,
  requireCoinbaseApiCredentials,
  type BuiltCoinbaseProxyRequest,
} from './security.js';
import { validateAccessToken } from './validateToken.js';
import { verifyWebhookSignature } from './verifyWebhookSignature.js';
import {
  createAuthenticatedApiRateLimiter,
  createPublicReadRateLimiter,
  createPublicWriteRateLimiter,
  createWebhookRateLimiter,
} from './rateLimits.js';

// Redis storage setup - use external Redis for production, in-memory for local
// dev. Redis holds all shared server state: push tokens, webhook dedupe, the
// transaction event feed, wallet intents, and voice sessions.
let database: any = null;
const databaseUrl = process.env.REDIS_URL;
const useDatabase = !!databaseUrl;

const REDIS_CONNECT_ATTEMPTS = 5;
const REDIS_CONNECT_BASE_DELAY_MS = 500;

async function connectRedisWithRetry(client: { connect(): Promise<unknown> }) {
  for (let attempt = 1; attempt <= REDIS_CONNECT_ATTEMPTS; attempt += 1) {
    try {
      await client.connect();
      return;
    } catch (error) {
      console.error(`❌ [REDIS] Connect attempt ${attempt}/${REDIS_CONNECT_ATTEMPTS} failed:`, summarizeErrorLog(error));
      if (attempt === REDIS_CONNECT_ATTEMPTS) {
        throw error;
      }
      const delayMs = REDIS_CONNECT_BASE_DELAY_MS * 2 ** (attempt - 1);
      await new Promise((resolveDelay) => setTimeout(resolveDelay, delayMs));
    }
  }
}

if (useDatabase) {
  const { createClient } = await import('redis');
  const redisClient = createClient({
    url: databaseUrl!,
    socket: {
      // Built-in reconnect: back off up to 5s between attempts, retry forever.
      reconnectStrategy: (retries: number) => Math.min(retries * 250, 5000),
    },
  });
  // Without an 'error' listener, a dropped socket emits an unhandled 'error'
  // event and kills the process. Log and let the client reconnect on its own.
  redisClient.on('error', (error: unknown) => {
    console.error('❌ [REDIS] Client error:', summarizeErrorLog(error));
  });
  await connectRedisWithRetry(redisClient);
  database = redisClient;
  console.log('✅ Using Redis for server state storage (production)');
} else if (isReleaseRuntime()) {
  throw new Error('REDIS_URL is required for release server state storage.');
} else {
  console.log('ℹ️ Using in-memory server state storage (local dev)');
}

/** Close long-lived resources (Redis) during graceful shutdown. */
export async function closeAppResources() {
  if (database) {
    try {
      await database.close();
    } catch (error) {
      console.error('❌ [REDIS] Error closing client during shutdown:', summarizeErrorLog(error));
    }
  }
}

// APNs setup for direct iOS push notifications. Native iOS tokens never fall back to Expo.
const apnProvider = await createApnsProviderFromEnv(process.env, isReleaseRuntime());

const app = express();
const PORT = Number(process.env.PORT || 3000);

// On Fly.io there is exactly one trusted proxy hop (fly-proxy) in front of the
// app, so trust exactly 1 hop. `true` would trust the entire X-Forwarded-For
// chain, letting clients spoof req.ip with their own X-Forwarded-For header.
// The authoritative client IP on Fly is the Fly-Client-IP header, which
// fly-proxy always sets; see src/ip.ts and src/rateLimits.ts.
app.set('trust proxy', 1);

// Request timing for every response, labeled by the matched route pattern
// (never the raw URL) and status class. Served at GET /metrics below.
app.use(createHttpMetricsMiddleware());

const webhookRateLimiter = createWebhookRateLimiter();
const publicReadRateLimiter = createPublicReadRateLimiter();
const publicWriteRateLimiter = createPublicWriteRateLimiter();
const authenticatedApiRateLimiter = createAuthenticatedApiRateLimiter();

// CORS Configuration - Prevent random websites from calling your API
// Note: This does NOT affect:
// - Mobile apps (React Native) - they don't send Origin header
// - Webhooks (Coinbase servers) - server-to-server calls bypass CORS
// - Postman/curl - non-browser clients bypass CORS
const allowedOrigins = [
  'http://localhost:8081',   // Expo dev server
  'http://localhost:19000',  // Expo dev server (alternative)
  'http://localhost:19006',  // Expo web
  ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [])
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, server-to-server like webhooks)
    if (!origin) {
      return callback(null, true);
    }

    // Allow if origin is in allowlist
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Block all other origins (random websites). CorsOriginError is turned
    // into the standard error envelope by the final error handler.
    console.warn('⚠️ [CORS] Blocked request from unauthorized origin:', origin);
    callback(new CorsOriginError());
  },
  credentials: true,
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key']
}));

// For webhook signature verification, we need raw body
// Use express.raw() for webhook routes before JSON parsing
app.use('/webhooks/onramp', express.raw({ type: 'application/json' }));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Inbound request logging (webhooks only)
app.use((req, _res, next) => {
  if (req.path.startsWith('/webhooks')) {
    console.log('📥 Webhook:', req.path);
  }
  next();
});

// Liveness check (no auth required): the process is up and serving.
app.get('/healthz', (_req, res) => {
  res.json({ ok: true, message: 'Server is running' });
});

// Readiness check (no auth required): hard dependencies still answer. The Fly
// health check targets this path so a machine with a dead Redis connection is
// marked unhealthy instead of silently failing requests. See src/health.ts.
app.get('/readyz', async (_req, res) => {
  const readiness = await checkReadiness({
    redisPing: database ? () => database.ping() : null,
  });

  res.status(readiness.ok ? 200 : 503).json(readiness);
});

// Prometheus metrics (no auth required): scraped by Fly managed Prometheus
// via the [metrics] section in fly.toml. Labels are bounded; see src/metrics.ts.
app.get('/metrics', metricsHandler);

app.get('/.well-known/jwks.json', publicReadRateLimiter, (_req, res) => {
  try {
    res.json(getCdpJwks());
  } catch (error) {
    console.error('❌ [AUTH] JWKS is not configured:', summarizeErrorLog(error));
    return sendError(res, 500, 'ConfigurationError', 'Sign-in keys are not configured for this build.');
  }
});

// 🔒 GLOBAL AUTHENTICATION MIDDLEWARE
// All routes except public health and verification routes require a valid app access token
app.use((req, res, next) => {
  // Skip authentication for health checks, metrics, webhooks, and debug endpoints
  if (
    req.path === '/healthz' ||
    req.path === '/readyz' ||
    req.path === '/metrics' ||
    req.path === '/.well-known/jwks.json' ||
    req.path === '/oauth/callback' ||
    req.path.startsWith('/webhooks') ||
    req.path === '/internal/mobile/message/push' ||
    req.path === '/push-tokens/ping'
  ) {
    return next();
  }

  // Apply authentication to all other routes (including /push-tokens)
  return validateAccessToken(req, res, next);
});

app.use(authenticatedApiRateLimiter);
app.use(createPortalPairingRoutes({ redis: useDatabase ? database : null }));

app.get('/auth/me', (req, res) => {
  res.json({
    userId: req.userId,
  });
});

app.post('/auth/cdp-token', async (req, res) => {
  try {
    if (!req.userId) {
      return sendError(res, 401, 'Unauthorized', 'Sign in before opening your wallet.');
    }

    const token = await createCdpCustomAuthToken(req.userId);
    // The app requests this token exactly when it opens the user's wallet, so
    // a successfully issued token is the server-observed wallet-open event.
    mobileWalletOpenedTotal.inc();
    return res.json({ token });
  } catch (error) {
    console.error('❌ [AUTH] Unable to create Coinbase custom sign-in token:', summarizeErrorLog(error));
    return sendError(res, 500, 'ConfigurationError', 'Unable to open the wallet right now.');
  }
});

app.use(createMobileRoutes({ redis: useDatabase ? database : null }));

/**
 * Coinbase proxy for the mobile wallet operations declared in api-contract.openapiv3.yaml.
 * The app sends an operation name; the backend owns the Coinbase host, path, method, and signing.
 */

app.post("/server/api", async (req, res) => {

  try {
    const clientIp = await resolveClientIp(req);

    const requestSchema = z.object({
      operation: z.enum(COINBASE_PROXY_OPERATIONS),
      partnerUserRef: z.string().min(1).optional(),
      params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
      body: z.record(z.string(), z.unknown()).optional(),
      idempotencyKey: z.string().min(1).optional(),
    }).strict();

    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, 'BadRequest', 'A valid Coinbase proxy request is required.');
    }

    const { idempotencyKey, operation } = parsed.data;
    let proxyRequest: BuiltCoinbaseProxyRequest;
    let validatedTargetUrl: URL;
    try {
      proxyRequest = buildCoinbaseProxyRequest({
        operation,
        body: parsed.data.body,
        clientIp,
        currentUserId: req.userId,
        params: parsed.data.params,
        partnerUserRef: parsed.data.partnerUserRef,
      });
      validatedTargetUrl = validateBuiltProxyTarget(proxyRequest);
    } catch (error) {
      return sendError(
        res,
        400,
        'BadRequest',
        error instanceof Error ? error.message : 'A valid Coinbase proxy request is required.'
      );
    }

    if (requiresCoinbaseProxyIdempotency(operation) && !idempotencyKey) {
      return sendError(res, 400, 'BadRequest', 'An idempotency key is required for this Coinbase request.');
    }

    console.log('📤 [SERVER] Outgoing request:', summarizeProxyRequestLog(proxyRequest));

    const coinbaseCredentials = requireCoinbaseApiCredentials(process.env);
    const authToken = await generateJwt({
      apiKeyId: coinbaseCredentials.apiKeyId,
      apiKeySecret: coinbaseCredentials.apiKeySecret,
      requestMethod: proxyRequest.method,
      requestHost: validatedTargetUrl.hostname,
      requestPath: validatedTargetUrl.pathname,
      expiresIn: 120
    });

    // Build headers
    const headers = {
      ...(proxyRequest.method === 'POST' && { "Content-Type": "application/json" }),
      "Authorization": `Bearer ${authToken}`,
      ...(proxyRequest.method === 'POST' && idempotencyKey && { "Idempotency-Key": idempotencyKey }),
    };

    console.log('📌 [SERVER] Fetching final URL:', {
      host: validatedTargetUrl.host,
      path: validatedTargetUrl.pathname,
      method: proxyRequest.method,
    });
    // Forward request with authentication
    const response = await fetch(validatedTargetUrl.toString(), {
      method: proxyRequest.method,
      headers: headers,
      ...(proxyRequest.method === 'POST' && proxyRequest.body && { body: JSON.stringify(proxyRequest.body) })
    });

    // Try to parse as JSON, but handle text responses gracefully
    let data;
    const contentType = response.headers.get('content-type');

    try {
      if (contentType?.includes('application/json')) {
        data = await response.json();
        console.log('📥 [SERVER] Response received:', {
          status: response.status,
          statusText: response.statusText,
          summary: summarizeProxyResponseLog(data),
        });
      } else {
        // Non-JSON response (likely error), get as text
        const textResponse = await response.text();
        console.log('📥 [SERVER] Non-JSON response:', {
          status: response.status,
          statusText: response.statusText,
          textLength: textResponse.length,
        });

        // Return text error as JSON
        return sendError(
          res,
          response.ok ? 502 : response.status,
          'UpstreamApiError',
          'Coinbase returned an unreadable response.'
        );
      }
    } catch (parseError) {
      console.error('Failed to parse response:', summarizeErrorLog(parseError));
      return sendError(res, response.ok ? 502 : response.status, 'UpstreamResponseInvalid', 'Unable to read Coinbase response right now.');
    }

    // Return the upstream response (preserve status code)
    res.status(response.status).json(data);
  
  } catch (error) {
    if (error instanceof CoinbaseConfigurationError) {
      return sendError(res, error.statusCode, error.code, error.message);
    }

    console.error('Proxy error:', summarizeErrorLog(error));
    sendError(res, 500, 'ProxyRequestFailed', 'Unable to reach Coinbase right now.');
  }
});


// Zod schema for EVM balance query validation (SSRF protection)
const evmBalanceQuerySchema = z.object({
  address: z.string()
    .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid EVM address format'),
  network: z.enum(['base', 'ethereum', 'base-sepolia', 'ethereum-sepolia'])
    .default('base')
});

/**
 * EVM Token Balance Endpoint
 * GET /balances/evm?address=0x...&network=base
 *
 * Supported networks: base, ethereum, base-sepolia (testnets)
 * Returns token balances with USD prices from Coinbase Price API
 */
app.get('/balances/evm', async (req, res) => {
  try {
    // Validate and sanitize query parameters to prevent SSRF
    const validationResult = evmBalanceQuerySchema.safeParse(req.query);

    if (!validationResult.success) {
      return sendError(res, 400, 'BadRequest', 'Enter a valid EVM address and supported network.');
    }

    const { address, network } = validationResult.data;

    console.log('💰 [BALANCES] Fetching EVM balances', {
      addressLength: address.length,
      network,
    });

    // Ethereum Sepolia uses v1 REST API with network name (not chain ID)
    if (network === 'ethereum-sepolia') {
      const balancesPath = `/platform/v1/networks/ethereum-sepolia/addresses/${address}/balances`;
      const balancesUrl = `https://api.cdp.coinbase.com${balancesPath}`;

      console.log('🔗 [BALANCES] Ethereum Sepolia URL prepared', {
        host: 'api.cdp.coinbase.com',
        path: '/platform/v1/networks/ethereum-sepolia/addresses/{address}/balances',
      });

      const coinbaseCredentials = requireCoinbaseApiCredentials(process.env);
      const authToken = await generateJwt({
        apiKeyId: coinbaseCredentials.apiKeyId,
        apiKeySecret: coinbaseCredentials.apiKeySecret,
        requestMethod: 'GET',
        requestHost: 'api.cdp.coinbase.com',
        requestPath: balancesPath,
        expiresIn: 120
      });

      const balancesResponse = await fetch(balancesUrl, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });

      console.log(`📡 [BALANCES] Response status: ${balancesResponse.status} ${balancesResponse.statusText}`);

      if (!balancesResponse.ok) {
        const errorText = await balancesResponse.text();
        console.error('❌ [BALANCES] CDP API error details:', summarizeCoinbaseErrorResponse({
          bodyText: errorText,
          contentType: balancesResponse.headers.get('content-type'),
          status: balancesResponse.status,
          statusText: balancesResponse.statusText,
        }));
        return sendError(res, balancesResponse.status, 'CoinbaseBalanceUnavailable', 'Unable to refresh wallet balances right now.');
      }

      const balancesData = await balancesResponse.json();
      const balances = balancesData.data || [];

      console.log(`✅ [BALANCES] Fetched ${balances.length} Ethereum Sepolia balances`);

      // Transform v1 response to match v2 format
      const transformedBalances = balances
        .filter((b: any) => parseFloat(b.amount || '0') > 0)
        .map((b: any) => ({
          token: {
            symbol: (b.asset?.asset_id || 'UNKNOWN').toUpperCase(), // asset_id is lowercase, convert to uppercase
            contractAddress: b.asset?.contract_address || null,
            name: b.asset?.name || null,
          },
          amount: {
            amount: b.amount || '0',
            decimals: String(b.asset?.decimals || '18'), // Ensure string format
          },
          usdValue: null,
        }));

      return res.json({
        balances: transformedBalances,
        totalBalances: transformedBalances.length
      });
    }

    // For other networks (base, ethereum, base-sepolia), use v2 API
    const balancesPath = `/platform/v2/evm/token-balances/${network}/${address}`;
    const balancesUrl = `https://api.cdp.coinbase.com${balancesPath}`;

    const coinbaseCredentials = requireCoinbaseApiCredentials(process.env);
    const authToken = await generateJwt({
      apiKeyId: coinbaseCredentials.apiKeyId,
      apiKeySecret: coinbaseCredentials.apiKeySecret,
      requestMethod: 'GET',
      requestHost: 'api.cdp.coinbase.com',
      requestPath: balancesPath,
      expiresIn: 120
    });

    const balancesResponse = await fetch(balancesUrl, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    console.log(`📡 [BALANCES] Response status: ${balancesResponse.status} ${balancesResponse.statusText}`);

    if (!balancesResponse.ok) {
      const errorText = await balancesResponse.text();
      console.error('❌ [BALANCES] CDP API error details:', summarizeCoinbaseErrorResponse({
        bodyText: errorText,
        contentType: balancesResponse.headers.get('content-type'),
        status: balancesResponse.status,
        statusText: balancesResponse.statusText,
      }));
      return sendError(res, balancesResponse.status, 'CoinbaseBalanceUnavailable', 'Unable to refresh wallet balances right now.');
    }

    const balancesData = await balancesResponse.json();
    const balances = balancesData.balances || [];

    console.log(`✅ [BALANCES] Fetched ${balances.length} token balances`);

    // Filter zero balances and enrich with USD prices
    const enrichedBalances = await Promise.all(
      balances
        .filter((b: any) => parseFloat(b.amount?.amount || '0') > 0)
        .map(async (balance: any) => {
          const symbol = balance.token?.symbol || 'UNKNOWN';
          let usdPrice = null;
          let usdValue = null;

          if (symbol && symbol !== 'UNKNOWN') {
            try {
              const priceUrl = `https://api.coinbase.com/v2/prices/${symbol}-USD/spot`;
              const priceResponse = await fetch(priceUrl);

              if (priceResponse.ok) {
                const priceData = await priceResponse.json();
                usdPrice = parseFloat(priceData.data?.amount || '0');

                const tokenAmount = parseFloat(balance.amount?.amount || '0');
                const decimals = parseInt(balance.amount?.decimals || '0');
                const actualAmount = tokenAmount / Math.pow(10, decimals);
                usdValue = actualAmount * usdPrice;
              } else {
                console.warn(`⚠️ [PRICE] Price API returned ${priceResponse.status} for ${symbol}`);
              }
            } catch (e) {
              console.warn(`⚠️ [PRICE] Could not fetch price for ${symbol}:`, e instanceof Error ? e.message : e);
            }
          }

          return {
            token: balance.token,
            amount: balance.amount,
            usdPrice,
            usdValue
          };
        })
    );

    console.log(`💵 [BALANCES] Enriched ${enrichedBalances.length} balances with USD prices`);

    res.json({
      address,
      network,
      balances: enrichedBalances,
      totalBalances: enrichedBalances.length
    });

  } catch (error) {
    if (error instanceof CoinbaseConfigurationError) {
      return sendError(res, error.statusCode, error.code, 'Wallet balances are not available for this build yet.');
    }

    console.error('❌ [BALANCES] Error:', summarizeErrorLog(error));
    sendError(res, 500, 'BalanceRefreshFailed', 'Unable to refresh wallet balances right now.');
  }
});

/**
 * Solana Token Balance Endpoint
 * GET /balances/solana?address=...&network=solana
 *
 * Supported networks: solana (mainnet), solana-devnet (testnet)
 * Returns SPL token balances with USD prices from Coinbase Price API
 */
app.get('/balances/solana', async (req, res) => {
  try {
    const { address, network = 'solana' } = req.query;

    if (!address || typeof address !== 'string') {
      return sendError(res, 400, 'BadRequest', 'A valid Solana address is required.');
    }

    // Basic Solana address validation (base58, 32-44 chars)
    if (!address.match(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)) {
      return sendError(res, 400, 'BadRequest', 'Enter a valid Solana address.');
    }

    // Validate and sanitize network input - use allowlist to prevent SSRF
    const validNetworks: Record<string, string> = {
      'solana': 'solana',
      'solana-devnet': 'solana-devnet'
    };
    const sanitizedNetwork = validNetworks[network as string];
    if (!sanitizedNetwork) {
      return sendError(res, 400, 'BadRequest', 'Choose a supported Solana network.');
    }

    console.log('💰 [BALANCES] Fetching Solana balances', {
      addressLength: address.length,
      network: sanitizedNetwork,
    });

    // Use sanitized values in URL construction to prevent SSRF
    const balancesPath = `/platform/v2/solana/token-balances/${sanitizedNetwork}/${address}`;
    const balancesUrl = `https://api.cdp.coinbase.com${balancesPath}`;

    console.log('🔗 [BALANCES] Solana URL prepared', {
      host: 'api.cdp.coinbase.com',
      path: `/platform/v2/solana/token-balances/${sanitizedNetwork}/{address}`,
    });

    const coinbaseCredentials = requireCoinbaseApiCredentials(process.env);
    const authToken = await generateJwt({
      apiKeyId: coinbaseCredentials.apiKeyId,
      apiKeySecret: coinbaseCredentials.apiKeySecret,
      requestMethod: 'GET',
      requestHost: 'api.cdp.coinbase.com',
      requestPath: balancesPath,
      expiresIn: 120
    });

    const balancesResponse = await fetch(balancesUrl, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    console.log(`📡 [BALANCES] Response status: ${balancesResponse.status} ${balancesResponse.statusText}`);

    if (!balancesResponse.ok) {
      const errorText = await balancesResponse.text();
      console.error('❌ [BALANCES] CDP API error details:', summarizeCoinbaseErrorResponse({
        bodyText: errorText,
        contentType: balancesResponse.headers.get('content-type'),
        status: balancesResponse.status,
        statusText: balancesResponse.statusText,
      }));
      return sendError(res, balancesResponse.status, 'CoinbaseBalanceUnavailable', 'Unable to refresh wallet balances right now.');
    }

    const balancesData = await balancesResponse.json();
    const balances = balancesData.balances || [];

    console.log(`✅ [BALANCES] Fetched ${balances.length} Solana token balances`);

    // Filter zero balances and enrich with USD prices
    const enrichedBalances = await Promise.all(
      balances
        .filter((b: any) => parseFloat(b.amount?.amount || '0') > 0)
        .map(async (balance: any) => {
          const symbol = balance.token?.symbol || 'UNKNOWN';
          let usdPrice = null;
          let usdValue = null;

          if (symbol && symbol !== 'UNKNOWN') {
            try {
              const priceUrl = `https://api.coinbase.com/v2/prices/${symbol}-USD/spot`;
              const priceResponse = await fetch(priceUrl);

              if (priceResponse.ok) {
                const priceData = await priceResponse.json();
                usdPrice = parseFloat(priceData.data?.amount || '0');

                const tokenAmount = parseFloat(balance.amount?.amount || '0');
                const decimals = parseInt(balance.amount?.decimals || '0');
                const actualAmount = tokenAmount / Math.pow(10, decimals);
                usdValue = actualAmount * usdPrice;
              } else {
                console.warn(`⚠️ [PRICE] Price API returned ${priceResponse.status} for ${symbol}`);
              }
            } catch (e) {
              console.warn(`⚠️ [PRICE] Could not fetch price for ${symbol}:`, e instanceof Error ? e.message : e);
            }
          }

          return {
            token: balance.token,
            amount: balance.amount,
            usdPrice,
            usdValue
          };
        })
    );

    console.log(`💵 [BALANCES] Enriched ${enrichedBalances.length} Solana balances with USD prices`);

    res.json({
      address,
      network,
      balances: enrichedBalances,
      totalBalances: enrichedBalances.length
    });

  } catch (error) {
    if (error instanceof CoinbaseConfigurationError) {
      return sendError(res, error.statusCode, error.code, 'Wallet balances are not available for this build yet.');
    }

    console.error('❌ [BALANCES] Error:', summarizeErrorLog(error));
    sendError(res, 500, 'BalanceRefreshFailed', 'Unable to refresh wallet balances right now.');
  }
});

/**
 * Push Token Storage
 * POST /push-tokens
 *
 * Stores user's Expo push token for sending notifications
 * Uses Vercel KV (production) or in-memory Map (local dev)
 * Called when user opens app and registers for notifications
 */

// In-memory storage for local development
const pushTokenStore = new Map<string, PushTokenRecord>();

const pushTokenRequestSchema = z.object({
  userId: z.string().min(1),
  pushToken: z.string().min(1),
  platform: z.string().min(1),
  tokenType: z.enum(['native', 'expo']),
}).strict();

async function readPushTokenForUser(userId: string): Promise<PushTokenRecord | null> {
  if (useDatabase && database) {
    const data = await database.get(`pushtoken:${userId}`);
    return data ? JSON.parse(data) as PushTokenRecord : null;
  }

  return pushTokenStore.get(userId) || null;
}

async function writePushTokenForUser(userId: string, tokenData: PushTokenRecord) {
  if (useDatabase && database) {
    await database.set(`pushtoken:${userId}`, JSON.stringify(tokenData));
    console.log('✅ [PUSH] Token stored in database for user:', summarizePushTokenUserLog(userId));
    return;
  }

  pushTokenStore.set(userId, tokenData);
  console.log('✅ [PUSH] Token stored in memory for user:', summarizePushTokenUserLog(userId));
  console.log('📊 [PUSH] Total tokens in store:', pushTokenStore.size);
}

/**
 * Debug endpoint: Log when push token registration is attempted
 * No auth required - used to confirm that the app attempted registration.
 */
app.post('/push-tokens/ping', publicWriteRateLimiter, async (req, res) => {
  console.log('🔔 [PUSH DEBUG] Registration attempt detected from client:', {
    ...summarizePushRegistrationAttemptLog(req.body),
    timestamp: new Date().toISOString()
  });
  res.json({ received: true });
});

app.post('/push-tokens', async (req, res) => {
  try {
    const parsedBody = pushTokenRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      console.error('❌ [PUSH] Invalid registration request');
      return sendError(res, 400, 'BadRequest', 'A valid push token registration is required.');
    }

    const { userId, pushToken, platform, tokenType } = parsedBody.data;

    console.log('📥 [PUSH] Registration request received:', {
      ...summarizePushTokenRegistrationLog({
        currentUserId: req.userId,
        platform,
        pushToken,
        requestedUserId: userId,
        tokenType,
      }),
    });

    if (req.userId !== userId) {
      console.error('❌ [PUSH] Unauthorized token registration attempt:', {
        ...summarizePushTokenRegistrationLog({
          currentUserId: req.userId,
          platform,
          pushToken,
          requestedUserId: userId,
          tokenType,
        }),
      });
      return sendError(res, 403, 'Forbidden', 'Cannot register a push token for another user.');
    }

    const tokenData: PushTokenRecord = {
      token: pushToken,
      platform,
      tokenType,
      updatedAt: Date.now(),
    };

    await writePushTokenForUser(userId, tokenData);

    console.log('✅ [PUSH] Token registered successfully:', {
      ...summarizePushTokenRegistrationLog({
        currentUserId: req.userId,
        platform: tokenData.platform,
        pushToken: tokenData.token,
        requestedUserId: userId,
        tokenType: tokenData.tokenType,
      }),
    });
    mobilePushRegistrationsTotal.inc();
    res.json({ success: true });
  } catch (error) {
    console.error('❌ [PUSH] Error:', summarizeErrorLog(error));
    sendError(res, 500, 'PushTokenStoreFailed', 'Unable to register this device for notifications right now.');
  }
});

app.post('/internal/mobile/message/push', webhookRateLimiter, async (req, res) => {
  const result = await processMobileMessagePushRequest({
    headers: req.headers,
    body: req.body,
  }, {
    env: process.env,
    readPushTokenForUser,
    sendPushNotification: (tokenData, notification) => sendPushNotification(tokenData, notification, {
      apnProvider,
    }),
  });

  return res.status(result.status).json(result.body);
});

// Debug endpoint to check push token status
app.get('/push-tokens/debug/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    if (!canAccessPushTokenDebug(userId, req.userId)) {
      return sendError(res, 403, 'Forbidden', 'Cannot inspect another user\'s push token status.');
    }

    const tokenData = await readPushTokenForUser(userId);

    res.json(buildPushTokenDebugResponse(userId, tokenData));
  } catch (error) {
    sendError(res, 500, 'PushTokenStatusUnavailable', 'Unable to check push-token status right now.');
  }
});

/**
 * Coinbase Transaction Webhook Endpoint
 * POST /webhooks/onramp
 *
 * Receives onramp AND offramp transaction status updates from Coinbase (one
 * subscription URL serves both). Events: onramp/offramp.transaction.created,
 * .updated, .success, .failed — plus the widget-path alias
 * onramp.transaction.completed, normalized to .success at the parse boundary.
 *
 * Security: Verifies webhook signature using CDP API key + Rate limiting (DoS protection)
 * Use case: Send push notifications when transactions complete and record a
 * read-only per-user event feed (GET /events/onramp). Never credits funds.
 *
 * Note: This endpoint is PUBLIC (no auth middleware) because Coinbase servers call it
 */
app.post('/webhooks/onramp', webhookRateLimiter, async (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body ?? {});

  try {
    const webhookSecret = requireWebhookSecret(process.env.WEBHOOK_SECRET);
    const hook0Signature = req.headers['x-hook0-signature'];

    if (typeof hook0Signature !== 'string' || !hook0Signature.trim()) {
      console.warn('⚠️ [WEBHOOK] Missing X-Hook0-Signature header');
      return sendError(res, 401, 'MissingSignature', 'Webhook signature is required.');
    }

    if (!verifyWebhookSignature(hook0Signature, req.headers, rawBody, webhookSecret)) {
      console.error('❌ [WEBHOOK] Invalid signature');
      return sendError(res, 401, 'InvalidSignature', 'Webhook signature is invalid.');
    }
  } catch (error) {
    console.error('❌ [WEBHOOK] Webhook verification is not configured:', summarizeErrorLog(error));
    return sendError(res, 500, 'WebhookVerificationUnavailable', 'Webhook verification is not configured.');
  }

  const parsed = parseCanonicalTransactionWebhook(rawBody);
  if (parsed.kind !== 'ok') {
    return sendError(res, 400, 'BadRequest', 'Webhook body does not match the current transaction webhook contract.');
  }

  const webhook = parsed.webhook;
  console.log('🔔 [WEBHOOK] Received:', webhook.eventType);
  console.log('📦 [WEBHOOK] Summary:', summarizeWebhookLog(webhook));

  const webhookClaim = await claimTransactionWebhookEvent(webhook, useDatabase ? database : null);
  if (webhookClaim === 'processed') {
    return res.status(200).json({ received: true, duplicate: true });
  }
  if (webhookClaim === 'processing') {
    // Another attempt holds the processing lease but has not finished. Return a
    // retryable non-2xx so Coinbase redelivers instead of dropping the event —
    // a 200 here would lose the webhook if the leaseholder crashed mid-flight.
    res.setHeader('Retry-After', String(TRANSACTION_WEBHOOK_PROCESSING_LEASE_SECONDS));
    return sendError(res, 409, 'WebhookInProgress', 'This webhook event is already being processed. Please retry shortly.');
  }

  try {
    // Record the event into the read-only per-user feed first. This also
    // resolves the owning user for offramp events that arrive without a
    // top-level partnerUserRef (backfilled from earlier events on the same
    // transaction), so pushes below can be addressed.
    const resolvedUserRef = await ingestTransactionWebhook(webhook, useDatabase ? database : null);

    const sendUserPush = async (
      partnerUserRef: string,
      notification: { title: string; body: string; type: string },
    ) => {
      const userTokenData = await readPushTokenForUser(partnerUserRef);

      if (!userTokenData) {
        console.log('⚠️ [WEBHOOK] No push token found:', summarizeWebhookLog(webhook));
        return;
      }

      await sendPushNotification(userTokenData, {
        title: notification.title,
        body: notification.body,
        data: {
          transactionId: webhook.transactionId,
          type: notification.type,
          partnerUserRef,
        },
      }, {
        apnProvider,
      });
    };

    switch (webhook.eventType) {
      case 'onramp.transaction.created':
        console.log('📝 [WEBHOOK] Transaction created');
        break;

      case 'onramp.transaction.updated':
        console.log('🔄 [WEBHOOK] Transaction updated');
        break;

      case 'onramp.transaction.success': {
        console.log('✅ [WEBHOOK] Transaction completed');
        // partnerUserRef, amount, currency, and network are guaranteed by the
        // canonical parser for onramp success events.
        await sendUserPush(webhook.partnerUserRef!, {
          title: 'Purchase complete',
          body: `Your ${webhook.purchaseAmount} ${webhook.purchaseCurrency} has been delivered to your ${webhook.destinationNetwork} wallet.`,
          type: 'onramp_complete',
        });
        break;
      }

      case 'onramp.transaction.failed': {
        console.log('❌ [WEBHOOK] Transaction failed');
        await sendUserPush(webhook.partnerUserRef!, {
          title: 'Purchase failed',
          body: `Your purchase failed: ${webhook.failureReason}. Please try again.`,
          type: 'onramp_failed',
        });
        break;
      }

      case 'offramp.transaction.created':
        console.log('📝 [WEBHOOK] Cash-out transaction created');
        break;

      case 'offramp.transaction.updated':
        console.log('🔄 [WEBHOOK] Cash-out transaction updated');
        break;

      case 'offramp.transaction.success': {
        console.log('✅ [WEBHOOK] Cash-out transaction completed');
        if (!resolvedUserRef) {
          console.log('⚠️ [WEBHOOK] Cash-out success without a resolvable user:', summarizeWebhookLog(webhook));
          break;
        }

        await sendUserPush(resolvedUserRef, {
          title: 'Cash out complete',
          body: webhook.sellAmount && webhook.sellCurrency
            ? `Your ${webhook.sellAmount} ${webhook.sellCurrency} cash out is complete. The money is on its way to you.`
            : 'Your cash out is complete. The money is on its way to you.',
          type: 'offramp_complete',
        });
        break;
      }

      case 'offramp.transaction.failed': {
        console.log('❌ [WEBHOOK] Cash-out transaction failed');
        if (!resolvedUserRef) {
          console.log('⚠️ [WEBHOOK] Cash-out failure without a resolvable user:', summarizeWebhookLog(webhook));
          break;
        }

        await sendUserPush(resolvedUserRef, {
          title: 'Cash out failed',
          body: webhook.failureReason
            ? `Your cash out failed: ${webhook.failureReason}. Please try again.`
            : 'Your cash out failed. Please try again.',
          type: 'offramp_failed',
        });
        break;
      }
    }

    await markTransactionWebhookEventProcessed(webhook, useDatabase ? database : null);
    // Counted only after the event is marked processed: the dedupe claim
    // guarantees each settlement increments its buy/cash-out counter once.
    recordTransactionWebhookOutcome(webhook.eventType);
    return res.status(200).json({ received: true });
  } catch (error) {
    await releaseTransactionWebhookEventClaim(webhook, useDatabase ? database : null).catch(() => undefined);
    console.error('❌ [WEBHOOK] Error processing webhook:', summarizeErrorLog(error));
    return sendError(res, 502, 'WebhookProcessingFailed', 'Unable to process this webhook right now.');
  }
});

/**
 * Transaction Event Feed
 * GET /events/onramp
 *
 * Read-only list of the signed-in user's recent onramp/offramp lifecycle
 * events, recorded from verified Coinbase webhooks. Requires the standard app
 * access token (global auth middleware); never exposes another user's events
 * and never touches funds.
 */
app.get('/events/onramp', async (req, res) => {
  try {
    if (!req.userId) {
      return sendError(res, 401, 'Unauthorized', 'Sign in to view your recent transaction updates.');
    }

    const events = await listTransactionEvents(req.userId, useDatabase ? database : null);
    return res.json({ events });
  } catch (error) {
    console.error('❌ [EVENTS] Unable to list transaction events:', summarizeErrorLog(error));
    return sendError(res, 500, 'TransactionEventsUnavailable', 'Unable to load your recent transaction updates right now.');
  }
});

// Final error handler: every error that falls through (CORS rejections,
// malformed JSON bodies, unexpected throws) leaves as the standard error
// envelope with a client-safe message. Must be registered last.
app.use(createErrorHandler());

export default app;
