import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test, { beforeEach } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  claimOnrampWebhookEvent,
  hasProcessedOnrampWebhookEvent,
  markOnrampWebhookEventProcessed,
  ONRAMP_WEBHOOK_PROCESSING_LEASE_SECONDS,
  onrampWebhookDedupeKey,
  parseCanonicalOnrampWebhook,
  releaseOnrampWebhookEventClaim,
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

test('onramp webhook parser rejects malformed current payloads', () => {
  assert.equal(parseCanonicalOnrampWebhook('{').kind, 'invalid');
  assert.equal(parseCanonicalOnrampWebhook(JSON.stringify({})).kind, 'invalid');
  assert.equal(parseCanonicalOnrampWebhook(JSON.stringify({ ...successWebhook, transactionId: '' })).kind, 'invalid');
  assert.equal(parseCanonicalOnrampWebhook(JSON.stringify({ ...successWebhook, purchaseAmount: '' })).kind, 'invalid');
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

test('onramp webhook events are claimed before side effects', async () => {
  const parsed = parseCanonicalOnrampWebhook(JSON.stringify(successWebhook));
  assert.equal(parsed.kind, 'ok');
  if (parsed.kind !== 'ok') {
    return;
  }

  assert.equal(await claimOnrampWebhookEvent(parsed.webhook), true);
  assert.equal(await hasProcessedOnrampWebhookEvent(parsed.webhook), false);
  assert.equal(await claimOnrampWebhookEvent(parsed.webhook), false);

  await releaseOnrampWebhookEventClaim(parsed.webhook);
  assert.equal(await hasProcessedOnrampWebhookEvent(parsed.webhook), false);
  assert.equal(await claimOnrampWebhookEvent(parsed.webhook), true);
});

test('onramp webhook processing claims can be retried after the short lease', async () => {
  const parsed = parseCanonicalOnrampWebhook(JSON.stringify(successWebhook));
  assert.equal(parsed.kind, 'ok');
  if (parsed.kind !== 'ok') {
    return;
  }

  const claimedAt = new Date('2026-05-13T12:00:00.000Z');
  const afterLease = new Date(claimedAt.getTime() + ONRAMP_WEBHOOK_PROCESSING_LEASE_SECONDS * 1000);

  assert.equal(await claimOnrampWebhookEvent(parsed.webhook, null, claimedAt), true);
  assert.equal(await claimOnrampWebhookEvent(parsed.webhook, null, claimedAt), false);
  assert.equal(await claimOnrampWebhookEvent(parsed.webhook, null, afterLease), true);

  await markOnrampWebhookEventProcessed(parsed.webhook);
  assert.equal(await claimOnrampWebhookEvent(parsed.webhook, null, afterLease), false);
});

test('onramp webhook handler uses the current signed body parser', () => {
  const appSource = readFileSync(resolve(testDir, 'app.ts'), 'utf8');
  const verifierSource = readFileSync(resolve(testDir, 'verifyWebhookSignature.ts'), 'utf8');

  assert.match(appSource, /x-hook0-signature/);
  assert.match(appSource, /parseCanonicalOnrampWebhook\(rawBody\)/);
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
