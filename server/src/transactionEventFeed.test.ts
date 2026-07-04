import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';

import {
  ingestTransactionWebhook,
  listTransactionEvents,
  recordTransactionEvent,
  resetTransactionEventFeedForTests,
  transactionEventFromWebhook,
} from './transactionEventFeed.js';
import type { CanonicalTransactionWebhook } from './onrampWebhook.js';

const onrampSuccess: CanonicalTransactionWebhook = {
  eventType: 'onramp.transaction.success',
  transactionId: 'tx-1',
  partnerUserRef: 'user-1',
  purchaseAmount: '25.00',
  purchaseCurrency: 'USDC',
  destinationNetwork: 'base',
};

beforeEach(() => {
  resetTransactionEventFeedForTests();
});

test('onramp webhooks map to feed events with the canonical amount fields', () => {
  const now = new Date('2026-07-01T00:00:00.000Z');
  const event = transactionEventFromWebhook(onrampSuccess, now);

  assert.deepEqual(event, {
    eventType: 'onramp.transaction.success',
    transactionId: 'tx-1',
    occurredAt: '2026-07-01T00:00:00.000Z',
    amount: '25.00',
    currency: 'USDC',
    network: 'base',
  });
});

test('offramp webhooks map sell amounts into the same feed shape', () => {
  const now = new Date('2026-07-01T00:00:00.000Z');
  const event = transactionEventFromWebhook({
    eventType: 'offramp.transaction.failed',
    transactionId: 'off-1',
    partnerUserRef: 'user-1',
    sellAmount: '10.00',
    sellCurrency: 'USDC',
    network: 'base',
    failureReason: 'bank transfer rejected',
  }, now);

  assert.deepEqual(event, {
    eventType: 'offramp.transaction.failed',
    transactionId: 'off-1',
    occurredAt: '2026-07-01T00:00:00.000Z',
    amount: '10.00',
    currency: 'USDC',
    network: 'base',
    failureReason: 'bank transfer rejected',
  });
});

test('ingest records events per user, newest first', async () => {
  await ingestTransactionWebhook({ ...onrampSuccess, eventType: 'onramp.transaction.created' });
  await ingestTransactionWebhook(onrampSuccess);

  const events = await listTransactionEvents('user-1');
  assert.equal(events.length, 2);
  assert.equal(events[0]?.eventType, 'onramp.transaction.success');
  assert.equal(events[1]?.eventType, 'onramp.transaction.created');
  assert.deepEqual(await listTransactionEvents('someone-else'), []);
});

test('redelivered webhooks do not duplicate feed entries', async () => {
  await ingestTransactionWebhook(onrampSuccess);
  await ingestTransactionWebhook(onrampSuccess);

  const events = await listTransactionEvents('user-1');
  assert.equal(events.length, 1);
});

test('offramp created events without a ref are backfilled once the ref resolves', async () => {
  // 1. `created` arrives with no partnerUserRef — nothing lands in a feed yet.
  const created: CanonicalTransactionWebhook = {
    eventType: 'offramp.transaction.created',
    transactionId: 'off-2',
    sellAmount: '5.00',
    sellCurrency: 'USDC',
  };
  assert.equal(await ingestTransactionWebhook(created), null);
  assert.deepEqual(await listTransactionEvents('user-1'), []);

  // 2. A later event on the same transaction carries the ref: the pending
  // created event is flushed into the user's feed in lifecycle order.
  const updated: CanonicalTransactionWebhook = {
    eventType: 'offramp.transaction.updated',
    transactionId: 'off-2',
    partnerUserRef: 'user-1',
  };
  assert.equal(await ingestTransactionWebhook(updated), 'user-1');

  const events = await listTransactionEvents('user-1');
  assert.deepEqual(events.map((event) => event.eventType), [
    'offramp.transaction.updated',
    'offramp.transaction.created',
  ]);
});

test('later ref-less events resolve the user from the remembered transaction mapping', async () => {
  await ingestTransactionWebhook({
    eventType: 'offramp.transaction.updated',
    transactionId: 'off-3',
    partnerUserRef: 'user-1',
  });

  // Success arrives without any partnerUserRef; the stored mapping resolves it
  // so the push notification can still be addressed.
  const resolved = await ingestTransactionWebhook({
    eventType: 'offramp.transaction.success',
    transactionId: 'off-3',
    sellAmount: '5.00',
    sellCurrency: 'USDC',
  });

  assert.equal(resolved, 'user-1');
  const events = await listTransactionEvents('user-1');
  assert.equal(events[0]?.eventType, 'offramp.transaction.success');
});

test('the per-user feed stays capped', async () => {
  for (let index = 0; index < 60; index += 1) {
    await recordTransactionEvent('user-1', {
      eventType: 'onramp.transaction.updated',
      transactionId: `tx-${index}`,
      occurredAt: new Date().toISOString(),
    });
  }

  const events = await listTransactionEvents('user-1');
  assert.equal(events.length, 50);
  assert.equal(events[0]?.transactionId, 'tx-59');
});

test('the feed works against redis-backed storage', async () => {
  const store = new Map<string, string>();
  const fakeRedis = {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async set(key: string, value: string) {
      store.set(key, value);
      return 'OK';
    },
    async del(key: string) {
      return store.delete(key) ? 1 : 0;
    },
  };

  assert.equal(await ingestTransactionWebhook({
    eventType: 'offramp.transaction.created',
    transactionId: 'off-4',
  }, fakeRedis), null);

  assert.equal(await ingestTransactionWebhook({
    eventType: 'offramp.transaction.success',
    transactionId: 'off-4',
    partnerUserRef: 'user-2',
    sellAmount: '1.00',
    sellCurrency: 'USDC',
  }, fakeRedis), 'user-2');

  const events = await listTransactionEvents('user-2', fakeRedis);
  assert.deepEqual(events.map((event) => event.eventType), [
    'offramp.transaction.success',
    'offramp.transaction.created',
  ]);
});
