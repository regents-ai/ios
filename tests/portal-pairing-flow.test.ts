import assert from 'node:assert/strict';
import test from 'node:test';

import {
  capturePortalPairingOwner,
  completePortalPairingForOwner,
  isPortalPairingOwnerCurrent,
  parsePortalPairingCallbackUrl,
  reducePortalPairingPhase,
} from '../utils/portalPairing/pairingFlow';

test('pairing phases cover status, pairing, completion, and disconnect', () => {
  let phase = reducePortalPairingPhase('loading', {
    type: 'statusLoaded',
    paired: false,
  });
  assert.equal(phase, 'idle');
  phase = reducePortalPairingPhase(phase, { type: 'start' });
  assert.equal(phase, 'starting');
  phase = reducePortalPairingPhase(phase, { type: 'authorizationReady' });
  assert.equal(phase, 'waiting');
  phase = reducePortalPairingPhase(phase, { type: 'callbackReceived' });
  assert.equal(phase, 'completing');
  phase = reducePortalPairingPhase(phase, { type: 'completed' });
  assert.equal(phase, 'paired');
  phase = reducePortalPairingPhase(phase, { type: 'disconnect' });
  assert.equal(phase, 'disconnecting');
  phase = reducePortalPairingPhase(phase, { type: 'disconnected' });
  assert.equal(phase, 'idle');
  assert.equal(
    reducePortalPairingPhase('loading', { type: 'statusLoaded', paired: true }),
    'paired',
  );
  assert.equal(reducePortalPairingPhase('completing', { type: 'failed' }), 'idle');
});

test('the pairing return parser accepts only the fixed app route with code and state', () => {
  assert.deepEqual(
    parsePortalPairingCallbackUrl(
      'regentsmobile://portal-return?code=code-1&state=state-1',
    ),
    { kind: 'ok', code: 'code-1', state: 'state-1' },
  );

  const rejected = [
    'regentsmobile://portal-return?code=code-1',
    'regentsmobile://portal-return?state=state-1',
    'regentsmobile://portal-return?code=code-1&state=state-1&token=secret',
    'regentsmobile://portal-return?code=one&code=two&state=state-1',
    'regentsmobile://foreign?code=code-1&state=state-1',
    'https://portal-return?code=code-1&state=state-1',
    'not-a-url',
  ];
  for (const url of rejected) {
    assert.deepEqual(parsePortalPairingCallbackUrl(url), { kind: 'reject' });
  }
});

test('owner tokens drop completions after sign-out, user switch, or replacement', () => {
  const owner = capturePortalPairingOwner('user-a', 7);
  assert.ok(owner);
  assert.equal(
    isPortalPairingOwnerCurrent(owner, {
      userId: 'user-a',
      attemptId: 7,
      mounted: true,
      focused: true,
    }),
    true,
  );
  assert.equal(
    isPortalPairingOwnerCurrent(owner, {
      userId: null,
      attemptId: 7,
      mounted: true,
      focused: true,
    }),
    false,
  );
  assert.equal(
    isPortalPairingOwnerCurrent(owner, {
      userId: 'user-b',
      attemptId: 7,
      mounted: true,
      focused: true,
    }),
    false,
  );
  assert.equal(
    isPortalPairingOwnerCurrent(owner, {
      userId: 'user-a',
      attemptId: 8,
      mounted: true,
      focused: true,
    }),
    false,
  );
  assert.equal(
    isPortalPairingOwnerCurrent(owner, {
      userId: 'user-a',
      attemptId: 7,
      mounted: true,
      focused: false,
    }),
    false,
  );
  assert.equal(capturePortalPairingOwner(null, 1), null);
});

test('a stale pairing owner prevents the complete request', async () => {
  const owner = capturePortalPairingOwner('user-a', 7);
  assert.ok(owner);
  let completeCalls = 0;

  const result = await completePortalPairingForOwner(
    owner,
    () => ({
      userId: 'user-a',
      attemptId: 7,
      mounted: true,
      focused: false,
    }),
    async () => {
      completeCalls += 1;
      return 'paired';
    },
  );

  assert.deepEqual(result, { kind: 'stale_before_request' });
  assert.equal(completeCalls, 0);
});

test('a completion that becomes stale after its request is discarded separately', async () => {
  const owner = capturePortalPairingOwner('user-a', 7);
  assert.ok(owner);
  let focused = true;
  let resolveComplete!: (value: string) => void;
  const response = new Promise<string>((resolve) => {
    resolveComplete = resolve;
  });

  const completion = completePortalPairingForOwner(
    owner,
    () => ({
      userId: 'user-a',
      attemptId: 7,
      mounted: true,
      focused,
    }),
    () => response,
  );
  focused = false;
  resolveComplete('paired');

  assert.deepEqual(await completion, { kind: 'stale_after_request' });
});
