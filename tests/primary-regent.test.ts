import test from 'node:test';
import assert from 'node:assert/strict';

import type {
  RegentRuntimeStatus,
  RegentStatus,
  RegentSummary,
} from '../types/regents';
import {
  compareRegentsByCommandCenterPriority,
  resolvePrimaryRegent,
} from '../utils/regentApi/primaryRegent';

function regent({
  id,
  status = 'active',
  runtimeStatus = 'online',
  lastActiveAt = '2026-07-23T12:00:00.000Z',
}: {
  id: string;
  status?: RegentStatus;
  runtimeStatus?: RegentRuntimeStatus;
  lastActiveAt?: string;
}): RegentSummary {
  return {
    id,
    name: id,
    status,
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
    lastActiveAt,
  };
}

test('primary Regent ordering matches Command Center status priority', () => {
  const agents = [
    regent({ id: 'active' }),
    regent({ id: 'paused', status: 'paused' }),
    regent({ id: 'waiting', runtimeStatus: 'waiting' }),
    regent({ id: 'attention', status: 'attention' }),
    regent({ id: 'offline', runtimeStatus: 'offline' }),
  ];

  assert.deepEqual(
    [...agents].sort(compareRegentsByCommandCenterPriority).map(({ id }) => id),
    ['offline', 'attention', 'waiting', 'paused', 'active']
  );
  assert.equal(resolvePrimaryRegent(agents)?.id, 'offline');
});

test('primary Regent ordering uses newest activity within the same priority', () => {
  const older = regent({
    id: 'older',
    status: 'attention',
    lastActiveAt: '2026-07-23T12:00:00.000Z',
  });
  const newer = regent({
    id: 'newer',
    status: 'attention',
    lastActiveAt: '2026-07-23T14:00:00.000Z',
  });

  assert.equal(resolvePrimaryRegent([older, newer])?.id, 'newer');
});

test('primary Regent resolution is non-mutating and handles an empty list', () => {
  const agents = [
    regent({ id: 'active' }),
    regent({ id: 'offline', runtimeStatus: 'offline' }),
  ];
  const originalOrder = agents.map(({ id }) => id);

  resolvePrimaryRegent(agents);

  assert.deepEqual(agents.map(({ id }) => id), originalOrder);
  assert.equal(resolvePrimaryRegent([]), null);
});
