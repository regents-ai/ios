import type { MessageThreadEvent } from '../../types/regents';

export const MESSAGE_EVENT_BURST_MS = 60_000;
export const MESSAGE_EVENT_BURST_INTERVAL_MS = 2_500;
export const MESSAGE_EVENT_IDLE_INTERVAL_MS = 30_000;

export function adoptMessageThreadId(currentThreadId: string, returnedThreadId?: string | null) {
  return returnedThreadId && returnedThreadId.trim() ? returnedThreadId : currentThreadId;
}

export function extendMessagePollBurst(nowMs = Date.now()) {
  return nowMs + MESSAGE_EVENT_BURST_MS;
}

export function nextMessagePollDelay(input: { nowMs?: number; burstUntilMs?: number | null }) {
  const nowMs = input.nowMs ?? Date.now();
  return input.burstUntilMs && input.burstUntilMs > nowMs
    ? MESSAGE_EVENT_BURST_INTERVAL_MS
    : MESSAGE_EVENT_IDLE_INTERVAL_MS;
}

export function completeMessagePoll(input: {
  currentTick: number;
  receivedEventCount: number;
  nowMs?: number;
}) {
  return {
    nextTick: input.currentTick + 1,
    burstUntilMs: input.receivedEventCount > 0 ? extendMessagePollBurst(input.nowMs) : null,
  };
}

export function mergeMessageThreadEvents(
  current: MessageThreadEvent[],
  incoming: MessageThreadEvent[]
) {
  const byId = new Map<string, MessageThreadEvent>();

  for (const event of current) {
    byId.set(event.eventId, event);
  }
  for (const event of incoming) {
    if (!byId.has(event.eventId)) {
      byId.set(event.eventId, event);
    }
  }

  return [...byId.values()].sort((left, right) => {
    const timeDiff = new Date(left.ts).getTime() - new Date(right.ts).getTime();
    if (Number.isFinite(timeDiff) && timeDiff !== 0) {
      return timeDiff;
    }

    return left.eventId.localeCompare(right.eventId);
  });
}
