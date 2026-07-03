/**
 * Tolerant decode contract for backend payloads.
 *
 * Philosophy ported from hermex JSONValue.swift + SSEClient.swift: decoding
 * never crashes on new data. Unknown fields pass through untouched, an
 * unrecognized enum member becomes the 'unknown' case, and event entries the
 * app cannot identify are logged and skipped instead of failing the batch.
 * Log lines carry a privacy-safe category only — never payload contents.
 */

import type {
  MessageThread,
  MessageThreadEvent,
  MessageThreadStatus,
  RegentDetail,
  RegentReturnRequest,
  RegentRuntimeStatus,
  RegentSummary,
} from '@/types/regents';

function logDecodeFailure(category: string) {
  console.warn('[decode]', category);
}

/**
 * Coerces a wire value into a known enum member, mapping anything
 * unrecognized to 'unknown' with a privacy-safe log line.
 */
export function tolerantEnum<T extends string>(
  allowed: readonly T[],
  field: string
): (value: unknown) => T | 'unknown' {
  return (value) => {
    if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) {
      return value as T;
    }
    logDecodeFailure(`decode.enum.${field}`);
    return 'unknown';
  };
}

const threadStatus = tolerantEnum<MessageThreadStatus>(
  ['idle', 'running', 'waiting', 'failed'],
  'thread.status'
);

const runtimeStatus = tolerantEnum<RegentRuntimeStatus>(
  ['online', 'waiting', 'offline'],
  'regent.runtimeStatus'
);

const returnStatus = tolerantEnum<RegentReturnRequest['status']>(
  ['requested', 'approved', 'broadcasting', 'confirmed', 'failed'],
  'returnRequest.status'
);

/** Normalizes a thread's enum fields; unknown extra fields pass through. */
export function normalizeMessageThread<T extends MessageThread>(thread: T): T {
  return { ...thread, status: threadStatus(thread.status) };
}

/**
 * Keeps only event entries the app can identify (eventId, type, ts) and
 * normalizes their enum fields. Unknown event types are kept — the thread UI
 * renders them generically — but entries with no identity are logged and
 * skipped so one malformed event never sinks the batch.
 */
export function normalizeMessageThreadEvents(events: unknown): MessageThreadEvent[] {
  if (!Array.isArray(events)) {
    logDecodeFailure('decode.events.shape');
    return [];
  }

  const normalized: MessageThreadEvent[] = [];
  for (const entry of events) {
    const candidate = entry as MessageThreadEvent | null;
    if (
      !candidate ||
      typeof candidate !== 'object' ||
      typeof candidate.eventId !== 'string' ||
      typeof candidate.type !== 'string' ||
      typeof candidate.ts !== 'string'
    ) {
      logDecodeFailure('decode.event.skipped');
      continue;
    }

    normalized.push(
      candidate.status === undefined
        ? candidate
        : { ...candidate, status: threadStatus(candidate.status) }
    );
  }

  return normalized;
}

/** Normalizes a return request's status; everything else passes through. */
export function normalizeReturnRequest(returnRequest: RegentReturnRequest): RegentReturnRequest {
  return { ...returnRequest, status: returnStatus(returnRequest.status) };
}

/** Normalizes a Regent summary's enum fields. */
export function normalizeRegentSummary<T extends RegentSummary>(regent: T): T {
  return { ...regent, runtimeStatus: runtimeStatus(regent.runtimeStatus) };
}

/** Normalizes a Regent detail: summary enums plus its return requests. */
export function normalizeRegentDetail(detail: RegentDetail): RegentDetail {
  return {
    ...normalizeRegentSummary(detail),
    returnRequests: Array.isArray(detail.returnRequests)
      ? detail.returnRequests.map(normalizeReturnRequest)
      : [],
  };
}
