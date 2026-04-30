import cors from 'cors';
import express from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { z } from 'zod';

import { generateJwt } from '@coinbase/cdp-sdk/auth';
import { sendError } from './httpResponses.js';
import { createCdpCustomAuthToken, getCdpJwks } from './identity.js';
import { resolveClientIp } from './ip.js';
import { isReleaseRuntime } from './runtime.js';
import { createMobileRoutes } from './mobileRoutes.js';
import {
  hasProcessedOnrampWebhookEvent,
  markOnrampWebhookEventProcessed,
  parseCanonicalOnrampWebhook,
} from './onrampWebhook.js';
import {
  buildPushTokenDebugResponse,
  canAccessPushTokenDebug,
} from './pushTokens.js';
import {
  requireWebhookSecret,
  summarizeWebhookLog,
  summarizeProxyRequestLog,
  summarizeProxyResponseLog,
  validateProxyTarget,
  CoinbaseConfigurationError,
  requireCoinbaseApiCredentials,
} from './security.js';
import { validateAccessToken } from './validateToken.js';
import { verifyWebhookSignature } from './verifyWebhookSignature.js';

type PushTokenRecord = { token: string; platform: string; tokenType: 'native' | 'expo'; updatedAt: number };

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

// APNs setup for direct iOS push notifications
let apnProvider: any = null;
let useAPNs = false;
if (process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID && process.env.APNS_KEY) {
  try {
    const apn = await import('@parse/node-apn');

    // Handle both actual newlines and escaped \n in env var
    // If the env var contains literal "\n" strings, replace them with actual newlines
    const apnsKey = process.env.APNS_KEY!.replace(/\\n/g, '\n');

    apnProvider = new apn.Provider({
      token: {
        key: apnsKey,
        keyId: process.env.APNS_KEY_ID!,
        teamId: process.env.APNS_TEAM_ID!
      },
      production: true
    });
    useAPNs = true;
    console.log('✅ Using direct APNs for push notifications (production)');
  } catch (error) {
    console.error('❌ Failed to initialize APNs provider:', error instanceof Error ? error.message : error);
    console.warn('⚠️ Falling back to Expo push service');
    console.warn('💡 Check APNS_KEY format: must include -----BEGIN PRIVATE KEY----- header/footer');
    console.warn('💡 In Vercel, paste the key with actual newlines OR use \\n for line breaks');
  }
} else {
  console.log('ℹ️ Using Expo push service for notifications (dev)');
}

const app = express();
const PORT = Number(process.env.PORT || 3000);

// On Vercel, trust proxy to read x-forwarded-for
app.set('trust proxy', true);

// Rate limiter for webhook endpoint (DoS protection)
// Limits expensive operations (DB lookups, external API calls)
// Note: Rate limiting applies to ALL requests. Signature verification happens
// inside the route handler AFTER rate limiting to prevent bypass attacks.
const webhookRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 100, // Limit each IP to 100 requests per minute
  handler: (_req, res) =>
    sendError(res, 429, 'TooManyWebhookRequests', 'Too many webhook requests. Please try again later.'),
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  // Use IP address as the key
  keyGenerator: (req) => {
    const forwarded = req.headers['x-forwarded-for'];
    const forwardedIp = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0]?.trim();
    return ipKeyGenerator(forwardedIp || req.ip || 'unknown');
  }
});

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
  allowedHeaders: ['Content-Type', 'Authorization']
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

app.get('/.well-known/jwks.json', (_req, res) => {
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
    console.error('❌ [AUTH] Unable to create Coinbase custom sign-in token:', error);
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
 * Generic proxy server for Coinbase API calls:
 * - Handles JWT authentication and forwards requests to avoid CORS issues
 * - JWT generation requires server-side CDP secrets
 * - Centralizes authentication logic
 *
 * Usage: POST /server/api with { url, method, body }
 * Usage Pattern: Frontend → POST /server/api → Coinbase API → Response
 *
 * Automatically handles:
 * - JWT generation for api.developer.coinbase.com
 * - Method switching (GET for options, POST for orders)
 * - Error forwarding with proper status codes
 *
 * Note: Authentication handled by global middleware above
 */

app.post("/server/api", async (req, res) => {

  try {
    const clientIp = await resolveClientIp(req);

    // Validate the request structure
    const requestSchema = z.object({
      url: z.string(), // Must be a valid URL
      method: z.enum(['GET', 'POST']).optional(),
      body: z.any().optional(), // Any JSON body
    });

    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, 'BadRequest', 'A valid Coinbase proxy request is required.');
    }

    const { url: targetUrl, method: method, body: targetBody } = parsed.data;
    let authToken = null;
    const validatedTargetUrl = validateProxyTarget({
      targetUrl,
      currentUserId: req.userId,
    });

    console.log('📤 [SERVER] Outgoing request:', summarizeProxyRequestLog(targetUrl, method, targetBody));

    const isOnrampRequest = validatedTargetUrl.pathname.includes('/onramp/');

    // Add clientIp to onramp requests
    let finalBody = isOnrampRequest ? { ...targetBody, clientIp } : targetBody;
    let finalUrl = validatedTargetUrl.toString();
    
    // Auto-generate JWT for Coinbase API calls only
    // Use finalUrl for JWT generation, but DON'T include query params in JWT signature
    // Coinbase API expects JWT to only sign the pathname, not query string
    const finalUrlObj = new URL(finalUrl);
    if (finalUrlObj.hostname === "api.developer.coinbase.com" || finalUrlObj.hostname === "api.cdp.coinbase.com") {
      const coinbaseCredentials = requireCoinbaseApiCredentials(process.env);
      authToken = await generateJwt({
        apiKeyId: coinbaseCredentials.apiKeyId,
        apiKeySecret: coinbaseCredentials.apiKeySecret,
        requestMethod: method || 'POST',
        requestHost: finalUrlObj.hostname,
        requestPath: finalUrlObj.pathname, // DO NOT include .search (query params) - Coinbase rejects it
        expiresIn: 120
      });
    }

    // Build headers
    const headers = {
      ...(method === 'POST' && { "Content-Type": "application/json" }),
      ...(authToken && { "Authorization": `Bearer ${authToken}` }),
    };

    console.log('📌 [SERVER] Fetching final URL:', {
      host: finalUrlObj.host,
      path: finalUrlObj.pathname,
      method: method || 'POST',
    });
    // Forward request with authentication
    const response = await fetch(finalUrl, {
      method: method || 'POST',
      headers: headers,
      ...(method === 'POST' && finalBody && { body: JSON.stringify(finalBody) })
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
          textResponse || 'Coinbase returned an unreadable response.'
        );
      }
    } catch (parseError) {
      console.error('Failed to parse response:', parseError);
      return sendError(res, response.ok ? 502 : response.status, 'UpstreamResponseInvalid', 'Unable to read Coinbase response right now.');
    }

    // Return the upstream response (preserve status code)
    res.status(response.status).json(data);
  
  } catch (error) {
    if (error instanceof CoinbaseConfigurationError) {
      return sendError(res, error.statusCode, error.code, error.message);
    }

    console.error('Proxy error:', error);
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
        console.error('❌ [BALANCES] CDP API error response:', errorText);

        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { message: errorText };
        }

        console.error('❌ [BALANCES] CDP API error details:', errorData);
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
      console.error('❌ [BALANCES] CDP API error response:', errorText);

      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText };
      }

      console.error('❌ [BALANCES] CDP API error details:', errorData);
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

    console.error('❌ [BALANCES] Error:', error);
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
      console.error('❌ [BALANCES] CDP API error response:', errorText);

      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText };
      }

      console.error('❌ [BALANCES] CDP API error details:', errorData);
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

    console.error('❌ [BALANCES] Error:', error);
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
    console.log('✅ [PUSH] Token stored in database for user:', userId);
    return;
  }

  pushTokenStore.set(userId, tokenData);
  console.log('✅ [PUSH] Token stored in memory for user:', userId);
  console.log('📊 [PUSH] Total tokens in store:', pushTokenStore.size);
}

async function sendPushNotification(
  tokenData: PushTokenRecord,
  input: { title: string; body: string; data: Record<string, string | undefined> }
) {
  if (tokenData.tokenType === 'native' && useAPNs && apnProvider && tokenData.platform === 'ios') {
    console.log('📤 [WEBHOOK] Sending via direct APNs', {
      platform: tokenData.platform,
      tokenType: tokenData.tokenType,
      tokenLength: tokenData.token.length,
    });

    const apn = await import('@parse/node-apn');
    const notification = new apn.Notification({
      alert: { title: input.title, body: input.body },
      topic: 'com.regentslabs.mobile',
      sound: 'default',
      payload: input.data,
    });

    const result = await apnProvider.send(notification, tokenData.token);
    console.log('📊 [WEBHOOK] APNs result:', {
      sent: result.sent?.length || 0,
      failed: result.failed?.length || 0,
    });

    if (result.failed && result.failed.length > 0) {
      throw new Error('APNs rejected the notification.');
    }
    return;
  }

  console.log('📤 [WEBHOOK] Sending via Expo push service');
  const pushResponse = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: tokenData.token,
      sound: 'default',
      title: input.title,
      body: input.body,
      data: input.data,
    }),
  });

  const pushResult = await pushResponse.json().catch(() => null) as { data?: { status?: string; message?: string } } | null;
  if (!pushResponse.ok || pushResult?.data?.status === 'error') {
    throw new Error(pushResult?.data?.message || 'Push notification service rejected the notification.');
  }

  console.log('✅ [WEBHOOK] Push notification sent');
}

/**
 * Debug endpoint: Log when push token registration is attempted
 * No auth required - used to confirm that the app attempted registration.
 */
app.post('/push-tokens/ping', async (req, res) => {
  console.log('🔔 [PUSH DEBUG] Registration attempt detected from client:', {
    ...req.body,
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
      userId,
      platform,
      tokenType,
      reqUserId: req.userId,
      hasToken: !!pushToken,
      tokenLength: pushToken?.length
    });

    if (req.userId !== userId) {
      console.error('❌ [PUSH] Unauthorized token registration attempt:', {
        tokenUserId: req.userId,
        requestUserId: userId,
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
      userId,
      tokenType: tokenData.tokenType,
      platform: tokenData.platform
    });
    res.json({ success: true });
  } catch (error) {
    console.error('❌ [PUSH] Error:', error);
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
    console.error('❌ [WEBHOOK] Webhook verification is not configured:', error);
    return sendError(res, 500, 'WebhookVerificationUnavailable', 'Webhook verification is not configured.');
  }

  const parsed = parseCanonicalOnrampWebhook(rawBody);
  if (parsed.kind !== 'ok') {
    return sendError(res, 400, 'BadRequest', 'Webhook body does not match the current onramp contract.');
  }

  const webhook = parsed.webhook;
  console.log('🔔 [WEBHOOK] Received:', webhook.eventType);
  console.log('📦 [WEBHOOK] Summary:', summarizeWebhookLog(webhook));

  if (await hasProcessedOnrampWebhookEvent(webhook, useDatabase ? database : null)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    switch (webhook.eventType) {
      case 'onramp.transaction.created':
        console.log('📝 [WEBHOOK] Transaction created:', webhook.transactionId);
        break;

      case 'onramp.transaction.updated':
        console.log('🔄 [WEBHOOK] Transaction updated:', webhook.transactionId);
        break;

      case 'onramp.transaction.success': {
        console.log('✅ [WEBHOOK] Transaction completed:', webhook.transactionId);
        const partnerUserRef = webhook.partnerUserRef!;
        const userTokenData = await readPushTokenForUser(partnerUserRef);

        if (!userTokenData) {
          console.log('⚠️ [WEBHOOK] No push token found for user:', partnerUserRef);
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
        });
        break;
      }

      case 'onramp.transaction.failed': {
        console.log('❌ [WEBHOOK] Transaction failed:', webhook.transactionId);
        const partnerUserRef = webhook.partnerUserRef!;
        const userTokenData = await readPushTokenForUser(partnerUserRef);

        if (!userTokenData) {
          console.log('⚠️ [WEBHOOK] No push token found for user:', partnerUserRef);
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
        });
        break;
      }
    }

    await markOnrampWebhookEventProcessed(webhook, useDatabase ? database : null);
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('❌ [WEBHOOK] Error processing webhook:', error);
    return sendError(res, 502, 'WebhookProcessingFailed', 'Unable to process this webhook right now.');
  }
});

export default app;
