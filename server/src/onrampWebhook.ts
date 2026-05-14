import { z } from 'zod';

import { createJsonFileStore } from './jsonFileStore.js';

type OnrampWebhookEventRecord = {
  eventType: string;
  transactionId: string;
  claimedAt?: string;
  processedAt?: string;
  status: 'processing' | 'processed';
};

export const ONRAMP_WEBHOOK_PROCESSING_LEASE_SECONDS = 15 * 60;
const ONRAMP_WEBHOOK_PROCESSED_TTL_SECONDS = 60 * 60 * 24 * 90;

const processedEventStore = createJsonFileStore<{
  processedEvents: Record<string, OnrampWebhookEventRecord>;
}>('onramp-webhook-events.json', () => ({ processedEvents: {} }));

const onrampWebhookSchema = z.object({
  eventType: z.enum([
    'onramp.transaction.created',
    'onramp.transaction.updated',
    'onramp.transaction.success',
    'onramp.transaction.failed',
  ]),
  transactionId: z.string().min(1),
  partnerUserRef: z.string().min(1).optional(),
  purchaseAmount: z.string().min(1).optional(),
  purchaseCurrency: z.string().min(1).optional(),
  destinationNetwork: z.string().min(1).optional(),
  failureReason: z.string().min(1).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.eventType === 'onramp.transaction.success') {
    for (const field of ['partnerUserRef', 'purchaseAmount', 'purchaseCurrency', 'destinationNetwork'] as const) {
      if (!value[field]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `${field} is required for successful onramp events.`,
        });
      }
    }
  }

  if (value.eventType === 'onramp.transaction.failed') {
    for (const field of ['partnerUserRef', 'failureReason'] as const) {
      if (!value[field]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `${field} is required for failed onramp events.`,
        });
      }
    }
  }
});

export type CanonicalOnrampWebhook = z.infer<typeof onrampWebhookSchema>;

type RedisLike = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { EX?: number; NX?: boolean }): Promise<string | null>;
  del?(key: string): Promise<number>;
};

export function parseCanonicalOnrampWebhook(rawBody: string):
  | { kind: 'ok'; webhook: CanonicalOnrampWebhook }
  | { kind: 'invalid' } {
  try {
    const parsedJson = JSON.parse(rawBody) as unknown;
    const parsed = onrampWebhookSchema.safeParse(parsedJson);
    return parsed.success ? { kind: 'ok', webhook: parsed.data } : { kind: 'invalid' };
  } catch {
    return { kind: 'invalid' };
  }
}

export function onrampWebhookDedupeKey(webhook: Pick<CanonicalOnrampWebhook, 'eventType' | 'transactionId'>) {
  return `${webhook.eventType}:${webhook.transactionId}`;
}

function parseEventRecord(value: string | null): OnrampWebhookEventRecord | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as OnrampWebhookEventRecord;
    return parsed.status === 'processed' || parsed.status === 'processing' ? parsed : null;
  } catch {
    return null;
  }
}

function processingRecord(webhook: CanonicalOnrampWebhook, now = new Date()): OnrampWebhookEventRecord {
  return {
    eventType: webhook.eventType,
    transactionId: webhook.transactionId,
    claimedAt: now.toISOString(),
    status: 'processing',
  };
}

function processedRecord(webhook: CanonicalOnrampWebhook): OnrampWebhookEventRecord {
  return {
    eventType: webhook.eventType,
    transactionId: webhook.transactionId,
    processedAt: new Date().toISOString(),
    status: 'processed',
  };
}

export async function hasProcessedOnrampWebhookEvent(webhook: CanonicalOnrampWebhook, redis?: RedisLike | null) {
  const key = onrampWebhookDedupeKey(webhook);

  if (redis) {
    return parseEventRecord(await redis.get(`onramp-webhook:${key}`))?.status === 'processed';
  }

  return processedEventStore.read().processedEvents[key]?.status === 'processed';
}

export async function markOnrampWebhookEventProcessed(webhook: CanonicalOnrampWebhook, redis?: RedisLike | null) {
  const key = onrampWebhookDedupeKey(webhook);
  const record = processedRecord(webhook);

  if (redis) {
    await redis.set(`onramp-webhook:${key}`, JSON.stringify(record), {
      EX: ONRAMP_WEBHOOK_PROCESSED_TTL_SECONDS,
    });
    return;
  }

  processedEventStore.update((state) => {
    state.processedEvents[key] = record;
  });
}

export async function claimOnrampWebhookEvent(
  webhook: CanonicalOnrampWebhook,
  redis?: RedisLike | null,
  now = new Date(),
) {
  const key = onrampWebhookDedupeKey(webhook);
  const record = processingRecord(webhook, now);

  if (redis) {
    return (
      (await redis.set(`onramp-webhook:${key}`, JSON.stringify(record), {
        EX: ONRAMP_WEBHOOK_PROCESSING_LEASE_SECONDS,
        NX: true,
      })) !== null
    );
  }

  let claimed = false;
  processedEventStore.update((state) => {
    const existing = state.processedEvents[key];

    if (!existing || processingLeaseExpired(existing, now)) {
      state.processedEvents[key] = record;
      claimed = true;
    }
  });

  return claimed;
}

export async function releaseOnrampWebhookEventClaim(webhook: CanonicalOnrampWebhook, redis?: RedisLike | null) {
  const key = onrampWebhookDedupeKey(webhook);

  if (redis) {
    const existing = parseEventRecord(await redis.get(`onramp-webhook:${key}`));
    if (existing?.status === 'processing') {
      await redis.del?.(`onramp-webhook:${key}`);
    }
    return;
  }

  processedEventStore.update((state) => {
    if (state.processedEvents[key]?.status === 'processing') {
      delete state.processedEvents[key];
    }
  });
}

export function resetOnrampWebhookEventStoreForTests() {
  processedEventStore.reset();
}

function processingLeaseExpired(record: OnrampWebhookEventRecord, now: Date) {
  if (record.status !== 'processing') {
    return false;
  }

  if (!record.claimedAt) {
    return true;
  }

  const claimedAtMs = Date.parse(record.claimedAt);
  return !Number.isFinite(claimedAtMs) || now.getTime() - claimedAtMs >= ONRAMP_WEBHOOK_PROCESSING_LEASE_SECONDS * 1000;
}
