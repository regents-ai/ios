import { createJsonFileStore } from './jsonFileStore.js';
import {
  isOfframpWebhook,
  type CanonicalTransactionWebhook,
} from './onrampWebhook.js';

/**
 * Read-only transaction event feed.
 *
 * Verified Coinbase webhook events are recorded per user so the app can show
 * the transaction lifecycle (GET /events/onramp). This never moves funds and
 * never feeds any crediting logic.
 *
 * Offramp `created` events can arrive before Coinbase knows the
 * partnerUserRef. Those are cached by transactionId and flushed into the
 * user's feed once a later event for the same transaction resolves the ref.
 * The transactionId -> partnerUserRef mapping is also remembered so later
 * offramp events that arrive without a ref (for push delivery) still resolve.
 */

export type TransactionEvent = {
  eventType: CanonicalTransactionWebhook['eventType'];
  transactionId: string;
  occurredAt: string;
  amount?: string;
  currency?: string;
  network?: string;
  failureReason?: string;
};

const MAX_EVENTS_PER_USER = 50;
const PENDING_EVENT_TTL_SECONDS = 60 * 60 * 24;
const USER_REF_TTL_SECONDS = 60 * 60 * 24 * 90;

type FeedState = {
  eventsByUser: Record<string, TransactionEvent[]>;
  pendingByTransaction: Record<string, TransactionEvent>;
  userRefByTransaction: Record<string, string>;
};

const feedStore = createJsonFileStore<FeedState>('transaction-event-feed.json', () => ({
  eventsByUser: {},
  pendingByTransaction: {},
  userRefByTransaction: {},
}));

type RedisLike = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { EX?: number; NX?: boolean }): Promise<string | null>;
  del?(key: string): Promise<number>;
};

export function transactionEventFromWebhook(
  webhook: CanonicalTransactionWebhook,
  now = new Date(),
): TransactionEvent {
  if (isOfframpWebhook(webhook)) {
    return {
      eventType: webhook.eventType,
      transactionId: webhook.transactionId,
      occurredAt: now.toISOString(),
      ...(webhook.sellAmount ? { amount: webhook.sellAmount } : {}),
      ...(webhook.sellCurrency ? { currency: webhook.sellCurrency } : {}),
      ...(webhook.network ? { network: webhook.network } : {}),
      ...(webhook.failureReason ? { failureReason: webhook.failureReason } : {}),
    };
  }

  return {
    eventType: webhook.eventType,
    transactionId: webhook.transactionId,
    occurredAt: now.toISOString(),
    ...(webhook.purchaseAmount ? { amount: webhook.purchaseAmount } : {}),
    ...(webhook.purchaseCurrency ? { currency: webhook.purchaseCurrency } : {}),
    ...(webhook.destinationNetwork ? { network: webhook.destinationNetwork } : {}),
    ...(webhook.failureReason ? { failureReason: webhook.failureReason } : {}),
  };
}

async function readUserEvents(userRef: string, redis?: RedisLike | null): Promise<TransactionEvent[]> {
  if (redis) {
    const raw = await redis.get(`transaction-events:${userRef}`);
    return raw ? (JSON.parse(raw) as TransactionEvent[]) : [];
  }

  return feedStore.read().eventsByUser[userRef] ?? [];
}

async function writeUserEvents(userRef: string, events: TransactionEvent[], redis?: RedisLike | null) {
  if (redis) {
    await redis.set(`transaction-events:${userRef}`, JSON.stringify(events));
    return;
  }

  feedStore.update((state) => {
    state.eventsByUser[userRef] = events;
  });
}

export async function recordTransactionEvent(userRef: string, event: TransactionEvent, redis?: RedisLike | null) {
  // Idempotent under Coinbase redelivery: one feed entry per lifecycle stage
  // of a transaction, refreshed in place if the same event arrives again.
  const existing = (await readUserEvents(userRef, redis)).filter(
    (entry) => !(entry.eventType === event.eventType && entry.transactionId === event.transactionId),
  );
  await writeUserEvents(userRef, [event, ...existing].slice(0, MAX_EVENTS_PER_USER), redis);
}

export async function listTransactionEvents(userRef: string, redis?: RedisLike | null): Promise<TransactionEvent[]> {
  return readUserEvents(userRef, redis);
}

async function rememberUserRefForTransaction(transactionId: string, userRef: string, redis?: RedisLike | null) {
  if (redis) {
    await redis.set(`transaction-events-ref:${transactionId}`, userRef, { EX: USER_REF_TTL_SECONDS });
    return;
  }

  feedStore.update((state) => {
    state.userRefByTransaction[transactionId] = userRef;
  });
}

async function lookupUserRefForTransaction(transactionId: string, redis?: RedisLike | null): Promise<string | null> {
  if (redis) {
    return redis.get(`transaction-events-ref:${transactionId}`);
  }

  return feedStore.read().userRefByTransaction[transactionId] ?? null;
}

async function stashPendingEvent(event: TransactionEvent, redis?: RedisLike | null) {
  if (redis) {
    await redis.set(`transaction-events-pending:${event.transactionId}`, JSON.stringify(event), {
      EX: PENDING_EVENT_TTL_SECONDS,
    });
    return;
  }

  feedStore.update((state) => {
    state.pendingByTransaction[event.transactionId] = event;
  });
}

async function takePendingEvent(transactionId: string, redis?: RedisLike | null): Promise<TransactionEvent | null> {
  if (redis) {
    const raw = await redis.get(`transaction-events-pending:${transactionId}`);
    if (!raw) {
      return null;
    }
    await redis.del?.(`transaction-events-pending:${transactionId}`);
    return JSON.parse(raw) as TransactionEvent;
  }

  let pending: TransactionEvent | null = null;
  feedStore.update((state) => {
    pending = state.pendingByTransaction[transactionId] ?? null;
    delete state.pendingByTransaction[transactionId];
  });
  return pending;
}

/**
 * Record one verified webhook into the feed and resolve the owning user.
 *
 * Returns the resolved partnerUserRef so the caller can address push
 * notifications, or null when no user can be resolved yet (the event is then
 * cached by transactionId awaiting a later event that carries the ref).
 */
export async function ingestTransactionWebhook(
  webhook: CanonicalTransactionWebhook,
  redis?: RedisLike | null,
  now = new Date(),
): Promise<string | null> {
  const event = transactionEventFromWebhook(webhook, now);
  const userRef = webhook.partnerUserRef ?? (await lookupUserRefForTransaction(webhook.transactionId, redis));

  if (!userRef) {
    // No user resolvable yet (offramp `created` events can arrive before
    // Coinbase attaches the partnerUserRef). Cache and wait for a later event.
    await stashPendingEvent(event, redis);
    return null;
  }

  await rememberUserRefForTransaction(webhook.transactionId, userRef, redis);

  // Flush any earlier ref-less event for this transaction first so the feed
  // stays in lifecycle order (newest first).
  const pending = await takePendingEvent(webhook.transactionId, redis);
  if (pending) {
    await recordTransactionEvent(userRef, pending, redis);
  }

  await recordTransactionEvent(userRef, event, redis);
  return userRef;
}

export function resetTransactionEventFeedForTests() {
  feedStore.reset();
}
