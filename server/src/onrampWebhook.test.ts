import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test, { beforeEach } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  claimTransactionWebhookEvent,
  hasProcessedTransactionWebhookEvent,
  isOfframpWebhook,
  markTransactionWebhookEventProcessed,
  parseCanonicalTransactionWebhook,
  releaseTransactionWebhookEventClaim,
  resetTransactionWebhookEventStoreForTests,
  TRANSACTION_WEBHOOK_PROCESSING_LEASE_SECONDS,
  transactionWebhookDedupeKey,
} from './onrampWebhook.js';
import { verifyWebhookSignature } from './verifyWebhookSignature.js';

const testDir = dirname(fileURLToPath(import.meta.url));

const successWebhook = {
  eventType: 'onramp.transaction.success',
  transactionId: 'tx-1',
  partnerUserRef: 'user-1',
  purchaseAmount: '25.00',
  purchaseCurrency: 'USDC',
  destinationNetwork: 'base',
} as const;

beforeEach(() => {
  resetTransactionWebhookEventStoreForTests();
});

test('onramp webhook parser accepts the documented canonical shape', () => {
  const parsed = parseCanonicalTransactionWebhook(JSON.stringify(successWebhook));

  assert.equal(parsed.kind, 'ok');
  if (parsed.kind === 'ok') {
    assert.equal(parsed.webhook.transactionId, 'tx-1');
    assert.equal(transactionWebhookDedupeKey(parsed.webhook), 'onramp.transaction.success:tx-1');
  }
});

test('widget completed alias is normalized to the canonical success event', () => {
  // The Coinbase widget path sends `completed` with an object purchaseAmount
  // and purchaseNetwork; docs.cdp.coinbase.com documents `success`. Both must
  // land as one canonical internal representation.
  const widgetPayload = {
    eventType: 'onramp.transaction.completed',
    transactionId: 'tx-widget',
    partnerUserRef: 'user-1',
    purchaseAmount: { value: '4.81', currency: 'USDC' },
    purchaseNetwork: 'base',
  };

  const parsed = parseCanonicalTransactionWebhook(JSON.stringify(widgetPayload));
  assert.equal(parsed.kind, 'ok');
  if (parsed.kind === 'ok') {
    assert.equal(parsed.webhook.eventType, 'onramp.transaction.success');
    assert.equal(isOfframpWebhook(parsed.webhook), false);
    if (!isOfframpWebhook(parsed.webhook)) {
      assert.equal(parsed.webhook.purchaseAmount, '4.81');
      assert.equal(parsed.webhook.purchaseCurrency, 'USDC');
      assert.equal(parsed.webhook.destinationNetwork, 'base');
    }
    // A retried delivery under the other name must dedupe to the same key.
    assert.equal(
      transactionWebhookDedupeKey(parsed.webhook),
      'onramp.transaction.success:tx-widget',
    );
  }
});

test('vendor extra fields are tolerated and stripped to the canonical shape', () => {
  const vendorPayload = {
    ...successWebhook,
    status: 'ONRAMP_TRANSACTION_STATUS_SUCCESS',
    createdAt: '2026-07-01T00:00:00Z',
    paymentTotal: { value: '26.00', currency: 'USD' },
    txHash: '0xabc',
  };

  const parsed = parseCanonicalTransactionWebhook(JSON.stringify(vendorPayload));
  assert.equal(parsed.kind, 'ok');
  if (parsed.kind === 'ok') {
    assert.deepEqual(parsed.webhook, successWebhook);
  }
});

test('onramp webhook parser rejects malformed current payloads', () => {
  assert.equal(parseCanonicalTransactionWebhook('{').kind, 'invalid');
  assert.equal(parseCanonicalTransactionWebhook(JSON.stringify({})).kind, 'invalid');
  assert.equal(parseCanonicalTransactionWebhook(JSON.stringify({ ...successWebhook, transactionId: '' })).kind, 'invalid');
  assert.equal(parseCanonicalTransactionWebhook(JSON.stringify({ ...successWebhook, purchaseAmount: '' })).kind, 'invalid');
  // Success events must carry the fields the push notification depends on.
  assert.equal(
    parseCanonicalTransactionWebhook(JSON.stringify({ ...successWebhook, partnerUserRef: undefined })).kind,
    'invalid',
  );
});

test('offramp webhook events parse to a canonical offramp shape', () => {
  const offrampPayload = {
    eventType: 'offramp.transaction.success',
    transactionId: 'off-tx-1',
    partnerUserRef: 'user-1',
    sellAmount: { value: '10.00', currency: 'USDC' },
    network: 'base',
  };

  const parsed = parseCanonicalTransactionWebhook(JSON.stringify(offrampPayload));
  assert.equal(parsed.kind, 'ok');
  if (parsed.kind === 'ok') {
    assert.equal(isOfframpWebhook(parsed.webhook), true);
    if (isOfframpWebhook(parsed.webhook)) {
      assert.equal(parsed.webhook.sellAmount, '10.00');
      assert.equal(parsed.webhook.sellCurrency, 'USDC');
      assert.equal(parsed.webhook.network, 'base');
    }
    assert.equal(transactionWebhookDedupeKey(parsed.webhook), 'offramp.transaction.success:off-tx-1');
  }
});

test('offramp webhook resolves partnerUserRef from the redirectUrl query', () => {
  const offrampPayload = {
    eventType: 'offramp.transaction.updated',
    transactionId: 'off-tx-2',
    redirectUrl: 'regentsmobile://offramp-send?partnerUserRef=user-9',
  };

  const parsed = parseCanonicalTransactionWebhook(JSON.stringify(offrampPayload));
  assert.equal(parsed.kind, 'ok');
  if (parsed.kind === 'ok') {
    assert.equal(parsed.webhook.partnerUserRef, 'user-9');
  }
});

test('offramp created events without a partnerUserRef still parse', () => {
  const offrampPayload = {
    eventType: 'offramp.transaction.created',
    transactionId: 'off-tx-3',
    sellAmount: { value: '5.00', currency: 'USDC' },
  };

  const parsed = parseCanonicalTransactionWebhook(JSON.stringify(offrampPayload));
  assert.equal(parsed.kind, 'ok');
  if (parsed.kind === 'ok') {
    assert.equal(parsed.webhook.partnerUserRef, undefined);
  }
});

test('transaction webhook events are recorded durably after processing', async () => {
  const parsed = parseCanonicalTransactionWebhook(JSON.stringify(successWebhook));
  assert.equal(parsed.kind, 'ok');
  if (parsed.kind !== 'ok') {
    return;
  }

  assert.equal(await hasProcessedTransactionWebhookEvent(parsed.webhook), false);
  await markTransactionWebhookEventProcessed(parsed.webhook);
  assert.equal(await hasProcessedTransactionWebhookEvent(parsed.webhook), true);
});

test('transaction webhook events are claimed before side effects', async () => {
  const parsed = parseCanonicalTransactionWebhook(JSON.stringify(successWebhook));
  assert.equal(parsed.kind, 'ok');
  if (parsed.kind !== 'ok') {
    return;
  }

  assert.equal(await claimTransactionWebhookEvent(parsed.webhook), 'claimed');
  assert.equal(await hasProcessedTransactionWebhookEvent(parsed.webhook), false);
  assert.equal(await claimTransactionWebhookEvent(parsed.webhook), 'processing');

  await releaseTransactionWebhookEventClaim(parsed.webhook);
  assert.equal(await hasProcessedTransactionWebhookEvent(parsed.webhook), false);
  assert.equal(await claimTransactionWebhookEvent(parsed.webhook), 'claimed');
});

test('transaction webhook claim distinguishes in-flight processing from processed duplicates', async () => {
  const parsed = parseCanonicalTransactionWebhook(JSON.stringify(successWebhook));
  assert.equal(parsed.kind, 'ok');
  if (parsed.kind !== 'ok') {
    return;
  }

  assert.equal(await claimTransactionWebhookEvent(parsed.webhook), 'claimed');
  // Lease held, not yet processed: the retrying sender must NOT be told duplicate.
  assert.equal(await claimTransactionWebhookEvent(parsed.webhook), 'processing');

  await markTransactionWebhookEventProcessed(parsed.webhook);
  // Fully processed: safe to tell the sender it is a duplicate.
  assert.equal(await claimTransactionWebhookEvent(parsed.webhook), 'processed');
});

test('offramp webhook events reuse the same claim mechanism', async () => {
  const parsed = parseCanonicalTransactionWebhook(JSON.stringify({
    eventType: 'offramp.transaction.failed',
    transactionId: 'off-tx-4',
    partnerUserRef: 'user-1',
    failureReason: 'bank transfer rejected',
  }));
  assert.equal(parsed.kind, 'ok');
  if (parsed.kind !== 'ok') {
    return;
  }

  assert.equal(await claimTransactionWebhookEvent(parsed.webhook), 'claimed');
  assert.equal(await claimTransactionWebhookEvent(parsed.webhook), 'processing');

  await markTransactionWebhookEventProcessed(parsed.webhook);
  assert.equal(await claimTransactionWebhookEvent(parsed.webhook), 'processed');
});

test('transaction webhook processing claims can be retried after the short lease', async () => {
  const parsed = parseCanonicalTransactionWebhook(JSON.stringify(successWebhook));
  assert.equal(parsed.kind, 'ok');
  if (parsed.kind !== 'ok') {
    return;
  }

  const claimedAt = new Date('2026-05-13T12:00:00.000Z');
  const afterLease = new Date(claimedAt.getTime() + TRANSACTION_WEBHOOK_PROCESSING_LEASE_SECONDS * 1000);

  assert.equal(await claimTransactionWebhookEvent(parsed.webhook, null, claimedAt), 'claimed');
  assert.equal(await claimTransactionWebhookEvent(parsed.webhook, null, claimedAt), 'processing');
  assert.equal(await claimTransactionWebhookEvent(parsed.webhook, null, afterLease), 'claimed');

  await markTransactionWebhookEventProcessed(parsed.webhook);
  assert.equal(await claimTransactionWebhookEvent(parsed.webhook, null, afterLease), 'processed');
});

test('transaction webhook processing lease is short so crashed claims retry quickly', () => {
  assert.ok(
    TRANSACTION_WEBHOOK_PROCESSING_LEASE_SECONDS <= 120,
    `processing lease must stay short (got ${TRANSACTION_WEBHOOK_PROCESSING_LEASE_SECONDS}s)`
  );
});

test('transaction webhook redis claim reports processing and processed duplicates', async () => {
  const parsed = parseCanonicalTransactionWebhook(JSON.stringify(successWebhook));
  assert.equal(parsed.kind, 'ok');
  if (parsed.kind !== 'ok') {
    return;
  }

  const store = new Map<string, string>();
  const fakeRedis = {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async set(key: string, value: string, options?: { EX?: number; NX?: boolean }) {
      if (options?.NX && store.has(key)) {
        return null;
      }
      store.set(key, value);
      return 'OK';
    },
    async del(key: string) {
      return store.delete(key) ? 1 : 0;
    },
  };

  assert.equal(await claimTransactionWebhookEvent(parsed.webhook, fakeRedis), 'claimed');
  assert.equal(await claimTransactionWebhookEvent(parsed.webhook, fakeRedis), 'processing');

  await markTransactionWebhookEventProcessed(parsed.webhook, fakeRedis);
  assert.equal(await claimTransactionWebhookEvent(parsed.webhook, fakeRedis), 'processed');
});

test('transaction webhook route returns a retryable non-2xx while a claim is processing', () => {
  const appSource = readFileSync(resolve(testDir, 'app.ts'), 'utf8');

  // A processing (in-flight) claim must trigger a retryable 409, never a 200
  // duplicate acknowledgement that would make Coinbase drop the event.
  assert.match(appSource, /webhookClaim === 'processing'/);
  assert.match(appSource, /sendError\(res, 409, 'WebhookInProgress'/);
  assert.match(appSource, /webhookClaim === 'processed'/);
  assert.match(appSource, /\{ received: true, duplicate: true \}/);
});

test('transaction webhook handler uses the current signed body parser', () => {
  const appSource = readFileSync(resolve(testDir, 'app.ts'), 'utf8');
  const verifierSource = readFileSync(resolve(testDir, 'verifyWebhookSignature.ts'), 'utf8');

  assert.match(appSource, /x-hook0-signature/);
  assert.match(appSource, /parseCanonicalTransactionWebhook\(rawBody\)/);
  assert.match(verifierSource, /key === 'v1'/);
});

test('webhook signatures require the current v1 signature member', () => {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const headers = { 'content-type': 'application/json' };
  const rawBody = JSON.stringify(successWebhook);
  const signedPayload = [timestamp, 'content-type', 'application/json', rawBody].join('.');
  const signature = crypto.createHmac('sha256', 'test-secret').update(signedPayload).digest('hex');

  assert.equal(
    verifyWebhookSignature(`t=${timestamp},h=content-type,v1=${signature}`, headers, rawBody, 'test-secret'),
    true
  );
  assert.equal(
    verifyWebhookSignature(`t=${timestamp},h=content-type,v1=bad-signature`, headers, rawBody, 'test-secret'),
    false
  );
});
