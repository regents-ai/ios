import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test, { beforeEach } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  hasProcessedOnrampWebhookEvent,
  markOnrampWebhookEventProcessed,
  onrampWebhookDedupeKey,
  parseCanonicalOnrampWebhook,
  resetOnrampWebhookEventStoreForTests,
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
  resetOnrampWebhookEventStoreForTests();
});

test('onramp webhook parser accepts the current canonical shape', () => {
  const parsed = parseCanonicalOnrampWebhook(JSON.stringify(successWebhook));

  assert.equal(parsed.kind, 'ok');
  if (parsed.kind === 'ok') {
    assert.equal(parsed.webhook.transactionId, 'tx-1');
    assert.equal(onrampWebhookDedupeKey(parsed.webhook), 'onramp.transaction.success:tx-1');
  }
});

test('onramp webhook parser rejects old or alternate webhook shapes', () => {
  assert.equal(parseCanonicalOnrampWebhook(JSON.stringify({ ...successWebhook, event: successWebhook.eventType })).kind, 'invalid');
  assert.equal(parseCanonicalOnrampWebhook(JSON.stringify({ ...successWebhook, orderId: successWebhook.transactionId })).kind, 'invalid');
  assert.equal(parseCanonicalOnrampWebhook(JSON.stringify({ ...successWebhook, eventType: 'onramp.transaction.completed' })).kind, 'invalid');
  assert.equal(parseCanonicalOnrampWebhook(JSON.stringify({ ...successWebhook, purchaseAmount: { value: '25.00', currency: 'USDC' } })).kind, 'invalid');
});

test('onramp webhook events are recorded durably after processing', async () => {
  const parsed = parseCanonicalOnrampWebhook(JSON.stringify(successWebhook));
  assert.equal(parsed.kind, 'ok');
  if (parsed.kind !== 'ok') {
    return;
  }

  assert.equal(await hasProcessedOnrampWebhookEvent(parsed.webhook), false);
  await markOnrampWebhookEventProcessed(parsed.webhook);
  assert.equal(await hasProcessedOnrampWebhookEvent(parsed.webhook), true);
});

test('onramp webhook handler does not keep old signature or body branches', () => {
  const appSource = readFileSync(resolve(testDir, 'app.ts'), 'utf8');
  const verifierSource = readFileSync(resolve(testDir, 'verifyWebhookSignature.ts'), 'utf8');

  assert.doesNotMatch(appSource, /verifyLegacySignature|x-coinbase-signature|onramp\.transaction\.completed/);
  assert.doesNotMatch(appSource, /orderId|paymentAmount|purchaseNetwork|data\?\.transaction/);
  assert.doesNotMatch(verifierSource, /v0|older format/);
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
    verifyWebhookSignature(`t=${timestamp},h=content-type,v0=${signature}`, headers, rawBody, 'test-secret'),
    false
  );
});
