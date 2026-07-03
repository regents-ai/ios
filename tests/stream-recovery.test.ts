import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RECONNECT_THRESHOLD,
  initialStreamRecovery,
  onForegroundResume,
  onPollFailure,
  onPollSuccess,
  streamRecoveryLabel,
} from '../utils/streamRecovery';

test('a live stream shows no pill', () => {
  assert.equal(initialStreamRecovery.state, 'live');
  assert.equal(streamRecoveryLabel('live'), null);
});

test('one failure goes to checking, repeated failures escalate to reconnecting', () => {
  let status = onPollFailure(initialStreamRecovery);
  assert.equal(status.state, 'checking');

  for (let i = 1; i < RECONNECT_THRESHOLD; i += 1) {
    status = onPollFailure(status);
  }
  assert.equal(status.state, 'reconnecting');
  assert.ok(status.consecutiveFailures >= RECONNECT_THRESHOLD);
});

test('a successful poll clears back to live', () => {
  const failed = onPollFailure(onPollFailure(initialStreamRecovery));
  assert.equal(failed.state, 'reconnecting');

  const recovered = onPollSuccess();
  assert.equal(recovered.state, 'live');
  assert.equal(recovered.consecutiveFailures, 0);
});

test('foreground resume shows checking, but never downgrades an active reconnect', () => {
  assert.equal(onForegroundResume(initialStreamRecovery).state, 'checking');

  const reconnecting = onPollFailure(onPollFailure(initialStreamRecovery));
  const resumed = onForegroundResume(reconnecting);
  assert.equal(resumed.state, 'reconnecting', 'stays loud');
  assert.equal(resumed.consecutiveFailures, reconnecting.consecutiveFailures);
});

test('pill copy is user-facing, not internal', () => {
  assert.match(streamRecoveryLabel('checking')!, /Checking/);
  assert.match(streamRecoveryLabel('reconnecting')!, /Reconnecting/);
});
