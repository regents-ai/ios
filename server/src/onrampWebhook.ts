import { z } from 'zod';

import { createJsonFileStore } from './jsonFileStore.js';

const processedEventStore = createJsonFileStore<{
  processedEvents: Record<string, { eventType: string; transactionId: string; processedAt: string }>;
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

function processedRecord(webhook: CanonicalOnrampWebhook) {
  return {
    eventType: webhook.eventType,
    transactionId: webhook.transactionId,
    processedAt: new Date().toISOString(),
  };
}

export async function hasProcessedOnrampWebhookEvent(webhook: CanonicalOnrampWebhook, redis?: RedisLike | null) {
  const key = onrampWebhookDedupeKey(webhook);

  if (redis) {
    return (await redis.get(`onramp-webhook:${key}`)) !== null;
  }

  return !!processedEventStore.read().processedEvents[key];
}

export async function markOnrampWebhookEventProcessed(webhook: CanonicalOnrampWebhook, redis?: RedisLike | null) {
  const key = onrampWebhookDedupeKey(webhook);
  const record = processedRecord(webhook);

  if (redis) {
    await redis.set(`onramp-webhook:${key}`, JSON.stringify(record), { EX: 60 * 60 * 24 * 90, NX: true });
    return;
  }

  processedEventStore.update((state) => {
    state.processedEvents[key] = record;
  });
}

export function resetOnrampWebhookEventStoreForTests() {
  processedEventStore.reset();
}
