import test from 'node:test';
import assert from 'node:assert/strict';

import {
  initialLiveActivityState,
  redactedRuns,
  startRun,
  updateProgress,
  finishRun,
  reconcileOnRelaunch,
  type PendingRun,
} from '../utils/liveActivityModel';
import { computeActivityOps, orphanNativeActivityIds } from '../utils/liveActivitySync';

const t0 = 1_000_000;

function sendRun(id: string) {
  return {
    id,
    kind: 'send' as const,
    counterpartyAddress: '0x9999999999999999999999999999999999a1b2c3',
    rawAmount: '250',
    currency: 'USDC',
    createdAtMs: t0,
  };
}

test('new run produces a start op with only redacted fields', () => {
  const state = startRun(initialLiveActivityState, sendRun('run-1'));
  const ops = computeActivityOps([], redactedRuns(state));

  assert.equal(ops.length, 1);
  assert.equal(ops[0].op, 'start');
  const run = (ops[0] as { op: 'start'; run: Record<string, unknown> }).run;
  assert.equal(run.id, 'run-1');
  assert.equal(run.counterpartyHint, '…b2c3');
  assert.equal(run.amountBucket, 'medium');
  // The redacted projection must not leak the sensitive fields.
  assert.ok(!('counterpartyAddress' in run));
  assert.ok(!('rawAmount' in run));
});

test('unchanged projection produces no ops (throttle carries through)', () => {
  const state = startRun(initialLiveActivityState, sendRun('run-1'));
  const prev = redactedRuns(state);
  // Update inside the throttle window is dropped by the model...
  const throttled = updateProgress(state, 'run-1', 0.5, t0 + 200);
  assert.equal(throttled, state);
  // ...so the diff sees an identical projection and emits nothing.
  assert.deepEqual(computeActivityOps(prev, redactedRuns(throttled)), []);
});

test('progress change produces an update op, finish produces an end op', () => {
  const started = startRun(initialLiveActivityState, sendRun('run-1'));
  const prev = redactedRuns(started);

  const progressed = updateProgress(started, 'run-1', 0.5, t0 + 5_000);
  const updateOps = computeActivityOps(prev, redactedRuns(progressed));
  assert.deepEqual(
    updateOps.map((op) => op.op),
    ['update']
  );

  const finished = finishRun(progressed, 'run-1', 'settled', t0 + 10_000);
  const endOps = computeActivityOps(redactedRuns(progressed), redactedRuns(finished));
  assert.deepEqual(endOps, [{ op: 'end', id: 'run-1' }]);
});

test('orphan native activities are those with no run after reconciliation', () => {
  const rehydrated: PendingRun[] = [
    {
      ...sendRun('kept'),
      phase: 'progressing',
      progress: 0.4,
      updatedAtMs: t0,
      hasLiveSource: false,
    },
  ];
  const state = reconcileOnRelaunch(rehydrated);

  // The surviving run is stale (no live source) but keeps its activity.
  assert.equal(state.runs['kept'].phase, 'stale');
  assert.deepEqual(orphanNativeActivityIds(['kept', 'gone-1', 'gone-2'], state), [
    'gone-1',
    'gone-2',
  ]);
});
