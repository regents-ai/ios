import test from 'node:test';
import assert from 'node:assert/strict';

import { createDialTargetRefresher } from '../components/dial/targetRefresh';
import type { MessageThread, RegentSummary } from '../types/regents';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function regent(id: string, runtimeStatus: RegentSummary['runtimeStatus'] = 'online'): RegentSummary {
  return {
    id,
    name: id,
    status: 'active',
    runtimeStatus,
    runtimeKind: 'hosted',
    walletAddress: '0x1111111111111111111111111111111111111111',
    platformState: {
      claimedName: id,
      slug: id,
      formationStatus: 'ready',
      billingStatus: 'prepaid',
      runtimeStatus: 'ready',
      blockers: [],
      dashboardUrl: `https://example.com/${id}`,
    },
    voice: {
      enabled: true,
      health: 'ok',
      account: {
        required: true,
        satisfied: true,
        provider: 'openai_chatgpt',
      },
    },
    lastActiveAt: '2026-07-23T12:00:00.000Z',
  };
}

function thread(id: string, status: MessageThread['status'] = 'idle'): MessageThread {
  return {
    id,
    platformThreadId: `platform-${id}`,
    title: id,
    agentId: 'agent-1',
    agentName: 'Hermes',
    source: 'platform_rwr',
    status,
    latestNote: id,
    lastUpdatedAt: '2026-07-23T12:00:00.000Z',
  };
}

test('a refresh replaces cached targets with freshly ranked data', async () => {
  let primaryRegent = regent('cached');
  let urgentThreadId = 'cached-thread';
  const refresher = createDialTargetRefresher({
    loadRegents: async () => [
      regent('active'),
      regent('offline', 'offline'),
    ],
    loadThreads: async () => [
      thread('running', 'running'),
      thread('waiting', 'waiting'),
    ],
    updatePrimaryRegent: (regent) => {
      primaryRegent = regent!;
    },
    updateUrgentThreadId: (threadId) => {
      urgentThreadId = threadId!;
    },
  });

  await refresher.refresh();

  assert.equal(primaryRegent.id, 'offline');
  assert.equal(urgentThreadId, 'waiting');
});

test('a stale in-flight refresh cannot clobber newer targets', async () => {
  const firstRegents = deferred<RegentSummary[]>();
  const firstThreads = deferred<MessageThread[]>();
  const secondRegents = deferred<RegentSummary[]>();
  const secondThreads = deferred<MessageThread[]>();
  const regentRequests = [firstRegents, secondRegents];
  const threadRequests = [firstThreads, secondThreads];
  let primaryRegentId = 'cached';
  let urgentThreadId = 'cached-thread';
  const refresher = createDialTargetRefresher({
    loadRegents: () => regentRequests.shift()!.promise,
    loadThreads: () => threadRequests.shift()!.promise,
    updatePrimaryRegent: (regent) => {
      primaryRegentId = regent?.id ?? 'none';
    },
    updateUrgentThreadId: (threadId) => {
      urgentThreadId = threadId ?? 'none';
    },
  });

  const staleRefresh = refresher.refresh();
  const freshRefresh = refresher.refresh();
  secondRegents.resolve([regent('fresh')]);
  secondThreads.resolve([thread('fresh-thread')]);
  await freshRefresh;

  firstRegents.resolve([regent('stale')]);
  firstThreads.resolve([thread('stale-thread')]);
  await staleRefresh;

  assert.equal(primaryRegentId, 'fresh');
  assert.equal(urgentThreadId, 'fresh-thread');
});

test('a failed refresh preserves cached targets', async () => {
  let primaryRegentId = 'cached';
  let urgentThreadId = 'cached-thread';
  const refresher = createDialTargetRefresher({
    loadRegents: async () => {
      throw new Error('offline');
    },
    loadThreads: async () => {
      throw new Error('offline');
    },
    updatePrimaryRegent: (regent) => {
      primaryRegentId = regent?.id ?? 'none';
    },
    updateUrgentThreadId: (threadId) => {
      urgentThreadId = threadId ?? 'none';
    },
  });

  await refresher.refresh();

  assert.equal(primaryRegentId, 'cached');
  assert.equal(urgentThreadId, 'cached-thread');
});
