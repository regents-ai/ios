import { z } from 'zod';

import { createJsonFileStore } from './jsonFileStore.js';

/**
 * Coinbase transaction webhook handling for POST /webhooks/onramp.
 *
 * Coinbase delivers both onramp and offramp transaction lifecycle events to the
 * same subscription URL. Coinbase owns the inbound payload shape, so parsing is
 * vendor-tolerant at the boundary (unknown extra fields are stripped, and the
 * widget-path variants are normalized), but everything downstream sees exactly
 * one canonical internal representation:
 *
 * - `onramp.transaction.completed` (widget path) -> `onramp.transaction.success`
 * - object-form `purchaseAmount` ({ value, currency }) -> its string `value`
 * - `purchaseNetwork` -> `destinationNetwork`
 * - offramp `partnerUserRef` missing at the top level -> extracted from the
 *   `redirectUrl` query parameter when present
 */

export const ONRAMP_EVENT_TYPES = [
  'onramp.transaction.created',
  'onramp.transaction.updated',
  'onramp.transaction.success',
  'onramp.transaction.failed',
] as const;

export const OFFRAMP_EVENT_TYPES = [
  'offramp.transaction.created',
  'offramp.transaction.updated',
  'offramp.transaction.success',
  'offramp.transaction.failed',
] as const;

export type OnrampEventType = (typeof ONRAMP_EVENT_TYPES)[number];
export type OfframpEventType = (typeof OFFRAMP_EVENT_TYPES)[number];

export type CanonicalOnrampWebhook = {
  eventType: OnrampEventType;
  transactionId: string;
  partnerUserRef?: string;
  purchaseAmount?: string;
  purchaseCurrency?: string;
  destinationNetwork?: string;
  failureReason?: string;
};

export type CanonicalOfframpWebhook = {
  eventType: OfframpEventType;
  transactionId: string;
  partnerUserRef?: string;
  sellAmount?: string;
  sellCurrency?: string;
  network?: string;
  failureReason?: string;
};

export type CanonicalTransactionWebhook = CanonicalOnrampWebhook | CanonicalOfframpWebhook;

type TransactionWebhookEventRecord = {
  eventType: string;
  transactionId: string;
  claimedAt?: string;
  processedAt?: string;
  status: 'processing' | 'processed';
};

// Processing (push-notification delivery) takes seconds. A short lease means a
// crash mid-processing only blocks Coinbase's retries for one minute before the
// event can be claimed and processed again.
export const TRANSACTION_WEBHOOK_PROCESSING_LEASE_SECONDS = 60;
const TRANSACTION_WEBHOOK_PROCESSED_TTL_SECONDS = 60 * 60 * 24 * 90;

const processedEventStore = createJsonFileStore<{
  processedEvents: Record<string, TransactionWebhookEventRecord>;
}>('transaction-webhook-events.json', () => ({ processedEvents: {} }));

const amountObjectSchema = z.object({
  value: z.string().min(1),
  currency: z.string().min(1).optional(),
});

// Inbound onramp payload. The widget path sends `completed` instead of
// `success`, an object purchaseAmount, and purchaseNetwork instead of
// destinationNetwork; all are normalized below. Unknown vendor fields
// (status, createdAt, paymentTotal, txHash, ...) are stripped, not rejected.
const inboundOnrampSchema = z.object({
  eventType: z.enum([...ONRAMP_EVENT_TYPES, 'onramp.transaction.completed']),
  transactionId: z.string().min(1),
  partnerUserRef: z.string().min(1).optional(),
  purchaseAmount: z.union([z.string().min(1), amountObjectSchema]).optional(),
  purchaseCurrency: z.string().min(1).optional(),
  destinationNetwork: z.string().min(1).optional(),
  purchaseNetwork: z.string().min(1).optional(),
  failureReason: z.string().min(1).optional(),
});

// Inbound offramp payload. Coinbase may omit the top-level partnerUserRef and
// only carry it inside the redirectUrl query string.
const inboundOfframpSchema = z.object({
  eventType: z.enum(OFFRAMP_EVENT_TYPES),
  transactionId: z.string().min(1),
  partnerUserRef: z.string().min(1).optional(),
  sellAmount: z.union([z.string().min(1), amountObjectSchema]).optional(),
  network: z.string().min(1).optional(),
  destinationNetwork: z.string().min(1).optional(),
  redirectUrl: z.string().min(1).optional(),
  failureReason: z.string().min(1).optional(),
});

function partnerUserRefFromRedirectUrl(redirectUrl: string | undefined): string | undefined {
  if (!redirectUrl) {
    return undefined;
  }

  try {
    const ref = new URL(redirectUrl).searchParams.get('partnerUserRef');
    return ref && ref.length > 0 ? ref : undefined;
  } catch {
    return undefined;
  }
}

function normalizeOnrampWebhook(inbound: z.infer<typeof inboundOnrampSchema>): CanonicalOnrampWebhook | null {
  const eventType: OnrampEventType =
    inbound.eventType === 'onramp.transaction.completed' ? 'onramp.transaction.success' : inbound.eventType;
  const purchaseAmount =
    typeof inbound.purchaseAmount === 'object' ? inbound.purchaseAmount.value : inbound.purchaseAmount;
  const purchaseCurrency =
    inbound.purchaseCurrency ??
    (typeof inbound.purchaseAmount === 'object' ? inbound.purchaseAmount.currency : undefined);
  const destinationNetwork = inbound.destinationNetwork ?? inbound.purchaseNetwork;

  const webhook: CanonicalOnrampWebhook = {
    eventType,
    transactionId: inbound.transactionId,
    ...(inbound.partnerUserRef ? { partnerUserRef: inbound.partnerUserRef } : {}),
    ...(purchaseAmount ? { purchaseAmount } : {}),
    ...(purchaseCurrency ? { purchaseCurrency } : {}),
    ...(destinationNetwork ? { destinationNetwork } : {}),
    ...(inbound.failureReason ? { failureReason: inbound.failureReason } : {}),
  };

  if (eventType === 'onramp.transaction.success') {
    if (!webhook.partnerUserRef || !webhook.purchaseAmount || !webhook.purchaseCurrency || !webhook.destinationNetwork) {
      return null;
    }
  }

  if (eventType === 'onramp.transaction.failed' && (!webhook.partnerUserRef || !webhook.failureReason)) {
    return null;
  }

  return webhook;
}

function normalizeOfframpWebhook(inbound: z.infer<typeof inboundOfframpSchema>): CanonicalOfframpWebhook {
  const sellAmount = typeof inbound.sellAmount === 'object' ? inbound.sellAmount.value : inbound.sellAmount;
  const sellCurrency = typeof inbound.sellAmount === 'object' ? inbound.sellAmount.currency : undefined;
  const network = inbound.network ?? inbound.destinationNetwork;
  const partnerUserRef = inbound.partnerUserRef ?? partnerUserRefFromRedirectUrl(inbound.redirectUrl);

  return {
    eventType: inbound.eventType,
    transactionId: inbound.transactionId,
    ...(partnerUserRef ? { partnerUserRef } : {}),
    ...(sellAmount ? { sellAmount } : {}),
    ...(sellCurrency ? { sellCurrency } : {}),
    ...(network ? { network } : {}),
    ...(inbound.failureReason ? { failureReason: inbound.failureReason } : {}),
  };
}

export function isOfframpWebhook(webhook: CanonicalTransactionWebhook): webhook is CanonicalOfframpWebhook {
  return webhook.eventType.startsWith('offramp.');
}

export function parseCanonicalTransactionWebhook(rawBody: string):
  | { kind: 'ok'; webhook: CanonicalTransactionWebhook }
  | { kind: 'invalid' } {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawBody);
  } catch {
    return { kind: 'invalid' };
  }

  const onramp = inboundOnrampSchema.safeParse(parsedJson);
  if (onramp.success) {
    const webhook = normalizeOnrampWebhook(onramp.data);
    return webhook ? { kind: 'ok', webhook } : { kind: 'invalid' };
  }

  const offramp = inboundOfframpSchema.safeParse(parsedJson);
  if (offramp.success) {
    return { kind: 'ok', webhook: normalizeOfframpWebhook(offramp.data) };
  }

  return { kind: 'invalid' };
}

type RedisLike = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { EX?: number; NX?: boolean }): Promise<string | null>;
  del?(key: string): Promise<number>;
};

export function transactionWebhookDedupeKey(webhook: Pick<CanonicalTransactionWebhook, 'eventType' | 'transactionId'>) {
  return `${webhook.eventType}:${webhook.transactionId}`;
}

function parseEventRecord(value: string | null): TransactionWebhookEventRecord | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as TransactionWebhookEventRecord;
    return parsed.status === 'processed' || parsed.status === 'processing' ? parsed : null;
  } catch {
    return null;
  }
}

function processingRecord(webhook: CanonicalTransactionWebhook, now = new Date()): TransactionWebhookEventRecord {
  return {
    eventType: webhook.eventType,
    transactionId: webhook.transactionId,
    claimedAt: now.toISOString(),
    status: 'processing',
  };
}

function processedRecord(webhook: CanonicalTransactionWebhook): TransactionWebhookEventRecord {
  return {
    eventType: webhook.eventType,
    transactionId: webhook.transactionId,
    processedAt: new Date().toISOString(),
    status: 'processed',
  };
}

export async function hasProcessedTransactionWebhookEvent(webhook: CanonicalTransactionWebhook, redis?: RedisLike | null) {
  const key = transactionWebhookDedupeKey(webhook);

  if (redis) {
    return parseEventRecord(await redis.get(`transaction-webhook:${key}`))?.status === 'processed';
  }

  return processedEventStore.read().processedEvents[key]?.status === 'processed';
}

export async function markTransactionWebhookEventProcessed(webhook: CanonicalTransactionWebhook, redis?: RedisLike | null) {
  const key = transactionWebhookDedupeKey(webhook);
  const record = processedRecord(webhook);

  if (redis) {
    await redis.set(`transaction-webhook:${key}`, JSON.stringify(record), {
      EX: TRANSACTION_WEBHOOK_PROCESSED_TTL_SECONDS,
    });
    return;
  }

  processedEventStore.update((state) => {
    state.processedEvents[key] = record;
  });
}

export type TransactionWebhookClaimResult = 'claimed' | 'processing' | 'processed';

export async function claimTransactionWebhookEvent(
  webhook: CanonicalTransactionWebhook,
  redis?: RedisLike | null,
  now = new Date(),
): Promise<TransactionWebhookClaimResult> {
  const key = transactionWebhookDedupeKey(webhook);
  const record = processingRecord(webhook, now);

  if (redis) {
    const claimed = (await redis.set(`transaction-webhook:${key}`, JSON.stringify(record), {
      EX: TRANSACTION_WEBHOOK_PROCESSING_LEASE_SECONDS,
      NX: true,
    })) !== null;

    if (claimed) {
      return 'claimed';
    }

    const existing = parseEventRecord(await redis.get(`transaction-webhook:${key}`));
    // The record may have expired between SET NX and GET; treat that race as an
    // in-flight processing claim so the sender retries.
    return existing?.status === 'processed' ? 'processed' : 'processing';
  }

  let result: TransactionWebhookClaimResult = 'processing';
  processedEventStore.update((state) => {
    const existing = state.processedEvents[key];

    if (!existing || processingLeaseExpired(existing, now)) {
      state.processedEvents[key] = record;
      result = 'claimed';
      return;
    }

    result = existing.status === 'processed' ? 'processed' : 'processing';
  });

  return result;
}

export async function releaseTransactionWebhookEventClaim(webhook: CanonicalTransactionWebhook, redis?: RedisLike | null) {
  const key = transactionWebhookDedupeKey(webhook);

  if (redis) {
    const existing = parseEventRecord(await redis.get(`transaction-webhook:${key}`));
    if (existing?.status === 'processing') {
      await redis.del?.(`transaction-webhook:${key}`);
    }
    return;
  }

  processedEventStore.update((state) => {
    if (state.processedEvents[key]?.status === 'processing') {
      delete state.processedEvents[key];
    }
  });
}

export function resetTransactionWebhookEventStoreForTests() {
  processedEventStore.reset();
}

function processingLeaseExpired(record: TransactionWebhookEventRecord, now: Date) {
  if (record.status !== 'processing') {
    return false;
  }

  if (!record.claimedAt) {
    return true;
  }

  const claimedAtMs = Date.parse(record.claimedAt);
  return !Number.isFinite(claimedAtMs) || now.getTime() - claimedAtMs >= TRANSACTION_WEBHOOK_PROCESSING_LEASE_SECONDS * 1000;
}
