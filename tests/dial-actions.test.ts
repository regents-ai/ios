import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveDialActionHref } from '../components/dial/actionTargets';
import type { RegentSummary } from '../types/regents';

const primaryRegent: RegentSummary = {
  id: 'regent-1',
  name: 'Hermes',
  status: 'active',
  runtimeStatus: 'online',
  runtimeKind: 'hosted',
  walletAddress: '0x1111111111111111111111111111111111111111',
  platformState: {
    claimedName: 'Hermes',
    slug: 'hermes',
    formationStatus: 'ready',
    billingStatus: 'prepaid',
    runtimeStatus: 'ready',
    blockers: [],
    dashboardUrl: 'https://example.com/hermes',
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

test('navigation actions retain their declared target', () => {
  assert.equal(
    resolveDialActionHref(
      { kind: 'navigate', href: '/settings' },
      { primaryRegent: undefined, urgentThreadId: undefined }
    ),
    '/settings'
  );
});

test('Voice targets the primary agent and falls back while unresolved or empty', () => {
  assert.deepEqual(
    resolveDialActionHref(
      { kind: 'primaryAgentVoice' },
      { primaryRegent, urgentThreadId: undefined }
    ),
    {
      pathname: '/agent/[id]/voice',
      params: { id: 'regent-1', name: 'Hermes' },
    }
  );
  assert.equal(
    resolveDialActionHref(
      { kind: 'primaryAgentVoice' },
      { primaryRegent: undefined, urgentThreadId: undefined }
    ),
    '/agents'
  );
  assert.equal(
    resolveDialActionHref(
      { kind: 'primaryAgentVoice' },
      { primaryRegent: null, urgentThreadId: undefined }
    ),
    '/agents'
  );
});

test('Message targets the urgent thread and immediately falls back while unresolved or empty', () => {
  assert.deepEqual(
    resolveDialActionHref(
      { kind: 'urgentMessage' },
      { primaryRegent: undefined, urgentThreadId: 'thread-1' }
    ),
    {
      pathname: '/message/[id]',
      params: { id: 'thread-1' },
    }
  );
  assert.equal(
    resolveDialActionHref(
      { kind: 'urgentMessage' },
      { primaryRegent: undefined, urgentThreadId: undefined }
    ),
    '/message'
  );
  assert.equal(
    resolveDialActionHref(
      { kind: 'urgentMessage' },
      { primaryRegent: undefined, urgentThreadId: null }
    ),
    '/message'
  );
});
