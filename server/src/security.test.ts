import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCoinbaseProxyRequest,
  CoinbaseConfigurationError,
  requireCoinbaseApiCredentials,
  requiresCoinbaseProxyIdempotency,
  requireWebhookSecret,
  summarizeCoinbaseErrorResponse,
  summarizeWebhookLog,
  summarizeProxyRequestLog,
  summarizeProxyResponseLog,
  validateBuiltProxyTarget,
} from './security.js';

test('proxy builds only declared Coinbase operation targets', () => {
  const session = buildCoinbaseProxyRequest({
    operation: 'onramp_session',
    currentUserId: 'user-1',
    partnerUserRef: 'user-1',
    clientIp: '203.0.113.10',
    body: {
      destinationAddress: '0xabc',
    },
  });

  assert.equal(session.method, 'POST');
  assert.equal(session.url.toString(), 'https://api.cdp.coinbase.com/platform/v2/onramp/sessions');
  assert.deepEqual(session.body, {
    destinationAddress: '0xabc',
    clientIp: '203.0.113.10',
  });
  assert.equal(validateBuiltProxyTarget(session).hostname, 'api.cdp.coinbase.com');
});

test('proxy only builds user-scoped Coinbase paths for the signed-in user', () => {
  const ownBuyRequest = buildCoinbaseProxyRequest({
    operation: 'buy_transactions',
    currentUserId: 'user-1',
    partnerUserRef: 'user-1',
    params: {
      pageSize: 10,
    },
  });

  assert.equal(ownBuyRequest.url.pathname, '/onramp/v1/buy/user/user-1/transactions');
  assert.equal(ownBuyRequest.url.searchParams.get('pageSize'), '10');

  assert.throws(
    () => buildCoinbaseProxyRequest({
      operation: 'buy_transactions',
      currentUserId: 'user-1',
      partnerUserRef: 'user-2',
    }),
    /only access your own Coinbase records/
  );

  assert.throws(
    () => buildCoinbaseProxyRequest({
      operation: 'sell_transactions',
      currentUserId: 'user-1',
    }),
    /partner user reference is required/
  );
});

test('proxy rejects parameters outside the operation contract', () => {
  assert.throws(
    () => buildCoinbaseProxyRequest({
      operation: 'buy_options',
      currentUserId: 'user-1',
      params: {
        country: 'US',
        url: 'https://api.cdp.coinbase.com/platform/v2/unknown/write-endpoint',
      },
    }),
    /parameter is not allowed: url/
  );
});

test('proxy rejects undeclared operations at the boundary', () => {
  assert.throws(
    () => buildCoinbaseProxyRequest({
      operation: 'unknown_write' as any,
      currentUserId: 'user-1',
    }),
    /operation is not allowed/
  );
});

test('proxy log summaries expose structure without raw personal data', () => {
  const requestSummary = summarizeProxyRequestLog({
    body: {
      email: 'person@example.com',
      phoneNumber: '+12345678901',
      destinationAddress: '0xabc',
    },
    idempotencyRequired: true,
    method: 'POST',
    operation: 'onramp_order',
    url: new URL('https://api.cdp.coinbase.com/platform/v2/onramp/orders'),
  });

  assert.deepEqual(requestSummary, {
    operation: 'onramp_order',
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

test('Coinbase create paths require app-owned idempotency keys', () => {
  assert.equal(requiresCoinbaseProxyIdempotency('onramp_order'), true);
  assert.equal(requiresCoinbaseProxyIdempotency('onramp_session'), true);
  assert.equal(requiresCoinbaseProxyIdempotency('buy_transactions'), false);
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
  const summary = summarizeWebhookLog({
    eventType: 'onramp.transaction.success',
    transactionId: 'tx-123',
    partnerUserRef: 'user-1',
    destinationAddress: '0xabc',
  });

  assert.equal(summary.eventType, 'onramp.transaction.success');
  assert.match(summary.transactionIdHash!, /^[a-f0-9]{16}$/);
  assert.match(summary.partnerUserRefHash!, /^[a-f0-9]{16}$/);
  assert.equal(JSON.stringify(summary).includes('tx-123'), false);
  assert.equal(JSON.stringify(summary).includes('user-1'), false);
  assert.equal(summary.keyCount, 4);
  assert.deepEqual(summary.keys, ['destinationAddress', 'eventType', 'partnerUserRef', 'transactionId']);
});

test('Coinbase error summaries do not include raw upstream body values', () => {
  const summary = summarizeCoinbaseErrorResponse({
    status: 400,
    statusText: 'Bad Request',
    contentType: 'application/json',
    bodyText: JSON.stringify({
      message: 'wallet 0xabc cannot be read',
      token: 'secret-token',
      code: 'bad_request',
    }),
  });

  assert.equal(summary.status, 400);
  assert.equal(summary.statusText, 'Bad Request');
  assert.equal(summary.contentType, 'application/json');
  assert.equal(typeof summary.bodyLength, 'number');
  assert.deepEqual(summary.body, {
    kind: 'object',
    keyCount: 3,
    keys: ['code', 'message', 'token'],
  });
  assert.equal(JSON.stringify(summary).includes('0xabc'), false);
  assert.equal(JSON.stringify(summary).includes('secret-token'), false);
});
