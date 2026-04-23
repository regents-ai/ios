import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TESTFLIGHT_EXTERNAL_USER_ID,
  CoinbaseConfigurationError,
  isTrustedTestflightBypassToken,
  requireCoinbaseApiCredentials,
  requireWebhookSecret,
  summarizeWebhookLog,
  summarizeProxyRequestLog,
  summarizeProxyResponseLog,
  validateProxyTarget,
} from './security.js';

test('testflight bypass only accepts the exact mock token', () => {
  assert.equal(isTrustedTestflightBypassToken('testflight-mock-token'), true);
  assert.equal(isTrustedTestflightBypassToken('Bearer testflight-mock-token'), false);
  assert.equal(isTrustedTestflightBypassToken('abc-testflight-xyz'), false);
  assert.equal(isTrustedTestflightBypassToken(undefined), false);
});

test('proxy rejects non-allowed hosts and non-https targets', () => {
  assert.throws(
    () => validateProxyTarget({ targetUrl: 'http://api.cdp.coinbase.com/platform/v2/onramp/orders', currentUserId: 'user-1' }),
    /Only HTTPS proxy targets are allowed/
  );

  assert.throws(
    () => validateProxyTarget({ targetUrl: 'https://example.com/private', currentUserId: 'user-1' }),
    /Proxy target host is not allowed/
  );
});

test('proxy only allows user-scoped Coinbase paths for the signed-in user', () => {
  const ownBuyUrl = 'https://api.developer.coinbase.com/onramp/v1/buy/user/user-1/transactions?pageSize=10';
  const ownSandboxSellUrl = 'https://api.developer.coinbase.com/onramp/v1/sell/user/sandbox-user-1/transactions';
  const otherUserUrl = 'https://api.developer.coinbase.com/onramp/v1/buy/user/user-2/transactions';

  assert.equal(validateProxyTarget({ targetUrl: ownBuyUrl, currentUserId: 'user-1' }).pathname, '/onramp/v1/buy/user/user-1/transactions');
  assert.equal(validateProxyTarget({ targetUrl: ownSandboxSellUrl, currentUserId: 'user-1' }).pathname, '/onramp/v1/sell/user/sandbox-user-1/transactions');

  assert.throws(
    () => validateProxyTarget({ targetUrl: otherUserUrl, currentUserId: 'user-1' }),
    /only access your own Coinbase records/
  );
});

test('proxy allows the external review user id only for the review account', () => {
  const reviewUrl = `https://api.developer.coinbase.com/onramp/v1/buy/user/${TESTFLIGHT_EXTERNAL_USER_ID}/transactions`;

  assert.equal(
    validateProxyTarget({
      targetUrl: reviewUrl,
      currentUserId: 'testflight-reviewer',
      isTestAccount: true,
    }).pathname,
    `/onramp/v1/buy/user/${TESTFLIGHT_EXTERNAL_USER_ID}/transactions`
  );

  assert.throws(
    () => validateProxyTarget({ targetUrl: reviewUrl, currentUserId: 'user-1', isTestAccount: false }),
    /only access your own Coinbase records/
  );
});

test('proxy log summaries expose structure without raw personal data', () => {
  const requestSummary = summarizeProxyRequestLog(
    'https://api.cdp.coinbase.com/platform/v2/onramp/orders',
    'POST',
    {
      email: 'person@example.com',
      phoneNumber: '+12345678901',
      destinationAddress: '0xabc',
    }
  );

  assert.deepEqual(requestSummary, {
    host: 'api.cdp.coinbase.com',
    path: '/platform/v2/onramp/orders',
    method: 'POST',
    body: {
      keyCount: 3,
      keys: ['destinationAddress', 'email', 'phoneNumber'],
    },
  });

  const responseSummary = summarizeProxyResponseLog({
    transactions: [{ id: '1' }, { id: '2' }],
    partnerUserRef: 'user-1',
    paymentLink: { url: 'https://pay.coinbase.com' },
  });

  assert.deepEqual(responseSummary, {
    kind: 'object',
    keyCount: 3,
    keys: ['partnerUserRef', 'paymentLink', 'transactions'],
    transactionCount: 2,
  });
});

test('webhooks require a signing secret', () => {
  assert.equal(requireWebhookSecret('secret-value'), 'secret-value');
  assert.throws(() => requireWebhookSecret(undefined), /WEBHOOK_SECRET is required/);
  assert.throws(() => requireWebhookSecret('   '), /WEBHOOK_SECRET is required/);
});

test('coinbase proxy credentials are required before signing wallet requests', () => {
  assert.deepEqual(
    requireCoinbaseApiCredentials({
      CDP_API_KEY_ID: ' key-id ',
      CDP_API_KEY_SECRET: ' secret ',
    }),
    {
      apiKeyId: 'key-id',
      apiKeySecret: 'secret',
    }
  );

  assert.throws(
    () => requireCoinbaseApiCredentials({ CDP_API_KEY_ID: '', CDP_API_KEY_SECRET: 'secret' }),
    CoinbaseConfigurationError
  );
  assert.throws(
    () => requireCoinbaseApiCredentials({ CDP_API_KEY_ID: 'key-id' }),
    /Adding cash is not available/
  );
});

test('webhook logs only include a safe event summary', () => {
  assert.deepEqual(
    summarizeWebhookLog({
      eventType: 'onramp.transaction.success',
      transactionId: 'tx-123',
      partnerUserRef: 'user-1',
      destinationAddress: '0xabc',
    }),
    {
      eventType: 'onramp.transaction.success',
      transactionId: 'tx-123',
      keyCount: 4,
      keys: ['destinationAddress', 'eventType', 'partnerUserRef', 'transactionId'],
    }
  );
});
