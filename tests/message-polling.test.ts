import test from 'node:test';
import assert from 'node:assert/strict';

import {
  adoptMessageThreadId,
  completeMessagePoll,
  extendMessagePollBurst,
  mergeMessageThreadEvents,
  nextMessagePollDelay,
  MESSAGE_EVENT_BURST_INTERVAL_MS,
  MESSAGE_EVENT_IDLE_INTERVAL_MS,
} from '../utils/regentApi/messagePolling';
import type { MessageThreadEvent } from '../types/regents';

function event(input: Partial<MessageThreadEvent> & Pick<MessageThreadEvent, 'eventId' | 'ts'>): MessageThreadEvent {
  return {
    type: 'message.delta',
    threadId: '101~202~303',
    ...input,
  };
}

test('message detail adopts the run thread id returned after starting from a company thread', () => {
  assert.equal(
    adoptMessageThreadId('101', '101~202~301'),
    '101~202~301',
  );
});

test('message polling bursts for one minute after message activity', () => {
  const nowMs = Date.parse('2026-07-02T12:00:00.000Z');
  const burstUntilMs = extendMessagePollBurst(nowMs);

  assert.equal(
    nextMessagePollDelay({ nowMs: nowMs + 2_000, burstUntilMs }),
    MESSAGE_EVENT_BURST_INTERVAL_MS,
  );
  assert.equal(
    nextMessagePollDelay({ nowMs: burstUntilMs + 1, burstUntilMs }),
    MESSAGE_EVENT_IDLE_INTERVAL_MS,
  );
});

test('message polling schedules another tick even when a poll returns no events', () => {
  const completed = completeMessagePoll({
    currentTick: 4,
    receivedEventCount: 0,
    nowMs: Date.parse('2026-07-02T12:00:00.000Z'),
  });

  assert.equal(completed.nextTick, 5);
  assert.equal(completed.burstUntilMs, null);
});

test('message polling extends the burst window after receiving events', () => {
  const nowMs = Date.parse('2026-07-02T12:00:00.000Z');
  const completed = completeMessagePoll({
    currentTick: 4,
    receivedEventCount: 1,
    nowMs,
  });

  assert.equal(completed.nextTick, 5);
  assert.equal(completed.burstUntilMs, extendMessagePollBurst(nowMs));
});

test('message event merge dedupes and keeps chronological order', () => {
  const merged = mergeMessageThreadEvents(
    [
      event({ eventId: 'run:2', ts: '2026-07-02T12:00:02.000Z', chunk: 'Second' }),
      event({ eventId: 'run:1', ts: '2026-07-02T12:00:01.000Z', chunk: 'First' }),
    ],
    [
      event({ eventId: 'run:2', ts: '2026-07-02T12:00:02.000Z', chunk: 'Duplicate' }),
      event({ eventId: 'approval:1:requested', ts: '2026-07-02T12:00:03.000Z', riskCopy: 'Review this request.' }),
    ],
  );

  assert.deepEqual(
    merged.map((item) => item.eventId),
    ['run:1', 'run:2', 'approval:1:requested'],
  );
  assert.equal(merged[1]?.chunk, 'Second');
});
