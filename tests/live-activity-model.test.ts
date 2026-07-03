import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PROGRESS_THROTTLE_MS,
  STALENESS_TIMEOUT_MS,
  finishRun,
  initialLiveActivityState,
  markStale,
  reconcileOnRelaunch,
  redactRun,
  redactedRuns,
  startRun,
  updateProgress,
  type PendingRun,
} from '../utils/liveActivityModel';

function withRun(id = 'r1') {
  return startRun(initialLiveActivityState, {
    id,
    kind: 'send',
    counterpartyAddress: '0x1234567890abcdef',
    rawAmount: '250',
    currency: 'USDC',
    createdAtMs: 1000,
  });
}

test('a started run is pending and tracked', () => {
  const state = withRun();
  assert.equal(state.runs.r1.phase, 'pending');
  assert.equal(state.runs.r1.hasLiveSource, true);
});

test('progress updates are throttled to one per PROGRESS_THROTTLE_MS', () => {
  let state = withRun();
  state = updateProgress(state, 'r1', 0.3, 1000 + PROGRESS_THROTTLE_MS);
  assert.equal(state.runs.r1.progress, 0.3);

  // Too soon: dropped.
  const dropped = updateProgress(state, 'r1', 0.9, 1000 + PROGRESS_THROTTLE_MS + 10);
  assert.equal(dropped.runs.r1.progress, 0.3, 'update within throttle window ignored');

  // Far enough apart: accepted.
  const accepted = updateProgress(state, 'r1', 0.9, 1000 + 2 * PROGRESS_THROTTLE_MS + 10);
  assert.equal(accepted.runs.r1.progress, 0.9);
});

test('progress clamps to 0..1', () => {
  let state = withRun();
  state = updateProgress(state, 'r1', 5, 1000 + PROGRESS_THROTTLE_MS);
  assert.equal(state.runs.r1.progress, 1);
});

test('finishing a run removes it from active tracking', () => {
  const state = finishRun(withRun(), 'r1', 'settled', 5000);
  assert.equal(state.runs.r1, undefined);
});

test('silent runs are explicitly marked stale, not deleted', () => {
  const state = markStale(withRun(), 1000 + STALENESS_TIMEOUT_MS);
  assert.equal(state.runs.r1.phase, 'stale', 'shown as unknown, not frozen or gone');
});

test('a settled/failed run is never marked stale', () => {
  const finished = finishRun(withRun(), 'r1', 'settled', 2000);
  const state = markStale(finished, 999_999);
  assert.equal(state.runs.r1, undefined);
});

test('orphans on relaunch (no live source) are reconciled to stale, not dangling', () => {
  const orphan: PendingRun = {
    id: 'r1',
    kind: 'onramp',
    phase: 'progressing',
    progress: 0.5,
    createdAtMs: 1,
    updatedAtMs: 1,
    hasLiveSource: false, // rehydrated from a previous session
  };
  const state = reconcileOnRelaunch([orphan]);
  assert.equal(state.runs.r1.phase, 'stale');
});

test('a run that still has a live source survives relaunch reconciliation', () => {
  const live: PendingRun = {
    id: 'r2',
    kind: 'staking',
    phase: 'progressing',
    progress: 0.4,
    createdAtMs: 1,
    updatedAtMs: 1,
    hasLiveSource: true,
  };
  assert.equal(reconcileOnRelaunch([live]).runs.r2.phase, 'progressing');
});

test('the redacted projection never exposes full address or raw amount', () => {
  const redacted = redactedRuns(withRun());
  const serialized = JSON.stringify(redacted);

  assert.doesNotMatch(serialized, /0x1234567890abcdef/, 'no full address');
  assert.doesNotMatch(serialized, /"250"|:250\b/, 'no raw amount');
  assert.equal(redacted[0].counterpartyHint, '…cdef');
  assert.equal(redacted[0].amountBucket, 'medium');
});

test('amount buckets are coarse magnitudes only', () => {
  assert.equal(redactRun({ ...withRun().runs.r1, rawAmount: '5' }).amountBucket, 'small');
  assert.equal(redactRun({ ...withRun().runs.r1, rawAmount: '250' }).amountBucket, 'medium');
  assert.equal(redactRun({ ...withRun().runs.r1, rawAmount: '5000' }).amountBucket, 'large');
  assert.equal(redactRun({ ...withRun().runs.r1, rawAmount: undefined }).amountBucket, null);
});
