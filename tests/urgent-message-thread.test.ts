import test from 'node:test';
import assert from 'node:assert/strict';

import type { MessageThread, MessageThreadStatus } from '../types/regents';
import { resolveUrgentMessageThread } from '../utils/regentApi/urgentMessageThread';

function thread(
  id: string,
  status: MessageThreadStatus,
  lastUpdatedAt: string,
  approval?: { resolved: boolean }
): MessageThread {
  return {
    id,
    platformThreadId: `platform-${id}`,
    title: id,
    agentId: 'agent-1',
    agentName: 'Hermes',
    source: 'platform_rwr',
    status,
    latestNote: id,
    lastUpdatedAt,
    pendingApproval: approval
      ? {
          requestId: `request-${id}`,
          action: 'review',
          regentName: 'Hermes',
          riskCopy: 'Review this action.',
          resolved: approval.resolved,
        }
      : undefined,
  };
}

test('urgent thread ordering is approval, waiting, failed, running, then other', () => {
  const threads = [
    thread('idle', 'idle', '2026-07-23T15:00:00.000Z'),
    thread('running', 'running', '2026-07-23T14:00:00.000Z'),
    thread('failed', 'failed', '2026-07-23T13:00:00.000Z'),
    thread('waiting', 'waiting', '2026-07-23T12:00:00.000Z'),
    thread('approval', 'idle', '2026-07-23T11:00:00.000Z', { resolved: false }),
  ];

  assert.equal(resolveUrgentMessageThread(threads)?.id, 'approval');
});

test('the newest thread wins within the highest-priority group', () => {
  const threads = [
    thread('older-waiting', 'waiting', '2026-07-23T12:00:00.000Z'),
    thread('newer-waiting', 'waiting', '2026-07-23T14:00:00.000Z'),
    thread('newest-running', 'running', '2026-07-23T16:00:00.000Z'),
  ];

  assert.equal(resolveUrgentMessageThread(threads)?.id, 'newer-waiting');
});

test('resolved approvals do not outrank unresolved work, and empty input falls back', () => {
  const threads = [
    thread('resolved', 'idle', '2026-07-23T16:00:00.000Z', { resolved: true }),
    thread('failed', 'failed', '2026-07-23T12:00:00.000Z'),
  ];

  assert.equal(resolveUrgentMessageThread(threads)?.id, 'failed');
  assert.equal(resolveUrgentMessageThread([]), null);
});
