/**
 * Live Activity sync — pure diff between two redacted projections.
 *
 * The bridge (utils/liveActivityBridge.ts) mirrors the headless pending-run
 * model (utils/liveActivityModel.ts) onto iOS ActivityKit. This module decides
 * WHICH native calls that mirroring needs, as a pure function, so the rule set
 * is unit-testable in the node test lane without any native or React import.
 *
 * Everything here operates on RedactedRun only — the lock-screen-safe
 * projection. Full addresses and raw amounts never reach this layer, so they
 * can never reach a native activity.
 */

import type { LiveActivityState, RedactedRun } from './liveActivityModel';

export type ActivityOp =
  | { op: 'start'; run: RedactedRun }
  | { op: 'update'; run: RedactedRun }
  | { op: 'end'; id: string };

function runChanged(prev: RedactedRun, next: RedactedRun): boolean {
  return (
    prev.phase !== next.phase ||
    prev.progress !== next.progress ||
    prev.counterpartyHint !== next.counterpartyHint ||
    prev.amountBucket !== next.amountBucket
  );
}

/**
 * Computes the native operations that turn the previously mirrored projection
 * into the next one: new runs start an activity, changed runs update it, and
 * runs that vanished from the model (finished or dropped) end it. Unchanged
 * runs produce no op, so the throttling done by the model carries through to
 * ActivityKit untouched.
 */
export function computeActivityOps(prev: RedactedRun[], next: RedactedRun[]): ActivityOp[] {
  const prevById = new Map(prev.map((run) => [run.id, run]));
  const nextIds = new Set(next.map((run) => run.id));
  const ops: ActivityOp[] = [];

  for (const run of next) {
    const before = prevById.get(run.id);
    if (!before) {
      ops.push({ op: 'start', run });
    } else if (runChanged(before, run)) {
      ops.push({ op: 'update', run });
    }
  }
  for (const run of prev) {
    if (!nextIds.has(run.id)) {
      ops.push({ op: 'end', id: run.id });
    }
  }
  return ops;
}

/**
 * Native activity ids with no matching run in the model. On relaunch,
 * ActivityKit can still hold activities from a previous session; any activity
 * the reconciled model does not know about must be ended rather than left
 * frozen on the lock screen.
 */
export function orphanNativeActivityIds(nativeIds: string[], state: LiveActivityState): string[] {
  return nativeIds.filter((id) => !state.runs[id]);
}
