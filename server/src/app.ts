import cors from 'cors';
import express from 'express';
import { z } from 'zod';

import { generateJwt } from '@coinbase/cdp-sdk/auth';
import { sendError } from './httpResponses.js';
import { createCdpCustomAuthToken, getCdpJwks } from './identity.js';
import { resolveClientIp } from './ip.js';
import { isReleaseRuntime } from './runtime.js';
import { createMobileRoutes } from './mobileRoutes.js';
import {
  createApnsProviderFromEnv,
  sendPushNotification,
  type PushTokenRecord,
} from './pushDelivery.js';
import {
  claimOnrampWebhookEvent,
  markOnrampWebhookEventProcessed,
  parseCanonicalOnrampWebhook,
  releaseOnrampWebhookEventClaim,
} from './onrampWebhook.js';
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

// Redis storage setup - use external Redis for production, in-memory for local dev
let database: any = null;
const databaseUrl = process.env.REDIS_URL;
const useDatabase = !!databaseUrl;
if (useDatabase) {
  const { createClient } = await import('redis');
  database = await createClient({ url: databaseUrl! }).connect();
  console.log('✅ Using Redis for push token storage (production)');
} else if (isReleaseRuntime()) {
  throw new Error('REDIS_URL is required for release push-token storage.');
} else {
  console.log('ℹ️ Using in-memory storage for push tokens (local dev)');
}

// APNs setup for direct iOS push notifications. Native iOS tokens never fall back to Expo.
const apnProvider = await createApnsProviderFromEnv(process.env, isReleaseRuntime());

const app = express();
const PORT = Number(process.env.PORT || 3000);

// On Vercel, trust proxy to read x-forwarded-for
app.set('trust proxy', true);

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

    // Block all other origins (random websites)
    console.warn('⚠️ [CORS] Blocked request from unauthorized origin:', origin);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
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

// Health check (no auth required)
app.get("/health", (_req, res) => {
  res.json({ ok: true, message: 'Server is running' });
});

app.get('/.well-known/jwks.json', publicReadRateLimiter, (_req, res) => {
  try {
    res.json(getCdpJwks());
  } catch (error) {
    return sendError(
      res,
      500,
      'ConfigurationError',
      error instanceof Error ? error.message : 'JWKS is not configured.'
    );
  }
});

// 🔒 GLOBAL AUTHENTICATION MIDDLEWARE
// All routes except public health and verification routes require a valid app access token
app.use((req, res, next) => {
  // Skip authentication for health check, webhooks, and debug endpoints
  if (
    req.path === '/health' ||
    req.path === '/.well-known/jwks.json' ||
    req.path.startsWith('/webhooks') ||
    req.path === '/push-tokens/ping'
  ) {
    return next();
  }

  // Apply authentication to all other routes (including /push-tokens)
  return validateAccessToken(req, res, next);
});

app.use(authenticatedApiRateLimiter);

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
    return res.json({ token });
  } catch (error) {
    console.error('❌ [AUTH] Unable to create Coinbase custom sign-in token:', summarizeErrorLog(error));
    return sendError(
      res,
      500,
      'ConfigurationError',
      error instanceof Error ? error.message : 'Unable to open the wallet right now.'
    );
  }
});

app.use(createMobileRoutes());

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
    res.json({ success: true });
  } catch (error) {
    console.error('❌ [PUSH] Error:', summarizeErrorLog(error));
    sendError(res, 500, 'PushTokenStoreFailed', 'Unable to register this device for notifications right now.');
  }
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
 * Onramp Webhook Endpoint
 * POST /webhooks/onramp
 *
 * Receives transaction status updates from Coinbase
 * Events: onramp.transaction.created, onramp.transaction.updated, onramp.transaction.success, onramp.transaction.failed
 *
 * Security: Verifies webhook signature using CDP API key + Rate limiting (DoS protection)
 * Use case: Send push notifications when transactions complete
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

  const parsed = parseCanonicalOnrampWebhook(rawBody);
  if (parsed.kind !== 'ok') {
    return sendError(res, 400, 'BadRequest', 'Webhook body does not match the current onramp contract.');
  }

  const webhook = parsed.webhook;
  console.log('🔔 [WEBHOOK] Received:', webhook.eventType);
  console.log('📦 [WEBHOOK] Summary:', summarizeWebhookLog(webhook));

  const webhookClaimed = await claimOnrampWebhookEvent(webhook, useDatabase ? database : null);
  if (!webhookClaimed) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    switch (webhook.eventType) {
      case 'onramp.transaction.created':
        console.log('📝 [WEBHOOK] Transaction created');
        break;

      case 'onramp.transaction.updated':
        console.log('🔄 [WEBHOOK] Transaction updated');
        break;

      case 'onramp.transaction.success': {
        console.log('✅ [WEBHOOK] Transaction completed');
        const partnerUserRef = webhook.partnerUserRef!;
        const userTokenData = await readPushTokenForUser(partnerUserRef);

        if (!userTokenData) {
          console.log('⚠️ [WEBHOOK] No push token found:', summarizeWebhookLog(webhook));
          break;
        }

        await sendPushNotification(userTokenData, {
          title: 'Purchase complete',
          body: `Your ${webhook.purchaseAmount} ${webhook.purchaseCurrency} has been delivered to your ${webhook.destinationNetwork} wallet.`,
          data: {
            transactionId: webhook.transactionId,
            type: 'onramp_complete',
            partnerUserRef,
          },
        }, {
          apnProvider,
        });
        break;
      }

      case 'onramp.transaction.failed': {
        console.log('❌ [WEBHOOK] Transaction failed');
        const partnerUserRef = webhook.partnerUserRef!;
        const userTokenData = await readPushTokenForUser(partnerUserRef);

        if (!userTokenData) {
          console.log('⚠️ [WEBHOOK] No push token found:', summarizeWebhookLog(webhook));
          break;
        }

        await sendPushNotification(userTokenData, {
          title: 'Purchase failed',
          body: `Your purchase failed: ${webhook.failureReason}. Please try again.`,
          data: {
            transactionId: webhook.transactionId,
            type: 'onramp_failed',
            partnerUserRef,
          },
        }, {
          apnProvider,
        });
        break;
      }
    }

    await markOnrampWebhookEventProcessed(webhook, useDatabase ? database : null);
    return res.status(200).json({ received: true });
  } catch (error) {
    await releaseOnrampWebhookEventClaim(webhook, useDatabase ? database : null).catch(() => undefined);
    console.error('❌ [WEBHOOK] Error processing webhook:', summarizeErrorLog(error));
    return sendError(res, 502, 'WebhookProcessingFailed', 'Unable to process this webhook right now.');
  }
});

export default app;
