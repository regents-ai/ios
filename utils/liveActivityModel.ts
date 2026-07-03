/**
 * Live Activity model — internal plumbing ONLY.
 *
 * Adapted from hermex AgentLiveActivityManager.swift, scoped to Sean's
 * decision (2026-07-02): DEFER the native widget. This module is the pure,
 * headless state model a future lock-screen / Dynamic Island widget will
 * consume. There is NO native widget target, NO entitlements, NO UI here.
 *
 * It tracks pending runs (sends, onramp settlement, staking), throttles
 * progress updates, marks staleness explicitly, and reconciles orphans on app
 * relaunch (a pending run with no live source is not left dangling). All
 * lock-screen-safe redaction is encoded here so a widget consumer only ever
 * sees redacted fields — never a full address or a raw amount.
 *
 * Pure reducer, no React / timers / storage, so every rule is unit-testable.
 */

export type RunKind = 'send' | 'onramp' | 'staking';

export type RunPhase = 'pending' | 'progressing' | 'settled' | 'failed' | 'stale';

/** Minimum gap between accepted progress updates for one run. */
export const PROGRESS_THROTTLE_MS = 1_000;

/** A run with no update for this long is marked stale. */
export const STALENESS_TIMEOUT_MS = 90_000;

export type PendingRun = {
  id: string;
  kind: RunKind;
  phase: RunPhase;
  /** 0..1 progress. */
  progress: number;
  /** Full counterparty address — NEVER exposed to a widget consumer. */
  counterpartyAddress?: string;
  /** Raw amount string — NEVER exposed to a widget consumer. */
  rawAmount?: string;
  currency?: string;
  createdAtMs: number;
  updatedAtMs: number;
  /** True once a live source (in-app driver) is attached this session. */
  hasLiveSource: boolean;
};

export type LiveActivityState = {
  runs: Record<string, PendingRun>;
};

export const initialLiveActivityState: LiveActivityState = { runs: {} };

/** Starts tracking a pending run. Idempotent per id. */
export function startRun(
  state: LiveActivityState,
  run: Omit<PendingRun, 'phase' | 'progress' | 'updatedAtMs' | 'hasLiveSource'> & {
    progress?: number;
  }
): LiveActivityState {
  if (state.runs[run.id]) {
    return state;
  }
  return {
    runs: {
      ...state.runs,
      [run.id]: {
        ...run,
        phase: 'pending',
        progress: run.progress ?? 0,
        updatedAtMs: run.createdAtMs,
        hasLiveSource: true,
      },
    },
  };
}

/**
 * Applies a throttled progress update. Updates closer together than
 * PROGRESS_THROTTLE_MS are dropped (returns the state unchanged) so the model
 * — and any future widget — is not churned faster than it can render.
 */
export function updateProgress(
  state: LiveActivityState,
  id: string,
  progress: number,
  nowMs: number
): LiveActivityState {
  const run = state.runs[id];
  if (!run) {
    return state;
  }
  if (nowMs - run.updatedAtMs < PROGRESS_THROTTLE_MS) {
    return state;
  }

  const clamped = Math.min(1, Math.max(0, progress));
  return {
    runs: {
      ...state.runs,
      [id]: { ...run, phase: 'progressing', progress: clamped, updatedAtMs: nowMs },
    },
  };
}

/** Marks a run settled or failed and drops it from active tracking. */
export function finishRun(
  state: LiveActivityState,
  id: string,
  outcome: 'settled' | 'failed',
  nowMs: number
): LiveActivityState {
  const run = state.runs[id];
  if (!run) {
    return state;
  }
  const rest = { ...state.runs };
  delete rest[id];
  // Terminal runs are removed from active state; a consumer that showed them
  // gets one final phase via the returned run for its dismissal animation.
  void outcome;
  void nowMs;
  return { runs: rest };
}

/**
 * Marks runs stale when they have gone silent past STALENESS_TIMEOUT_MS. Stale
 * is explicit (not deletion) so a widget can show "status unknown" rather than
 * a frozen progress bar.
 */
export function markStale(state: LiveActivityState, nowMs: number): LiveActivityState {
  let changed = false;
  const runs: Record<string, PendingRun> = {};
  for (const [id, run] of Object.entries(state.runs)) {
    if (run.phase !== 'settled' && run.phase !== 'failed' && nowMs - run.updatedAtMs >= STALENESS_TIMEOUT_MS) {
      runs[id] = { ...run, phase: 'stale' };
      changed = true;
    } else {
      runs[id] = run;
    }
  }
  return changed ? { runs } : state;
}

/**
 * Reconciles orphans on app relaunch. A run persisted from a previous session
 * has no live in-app source this session; rather than leave it dangling with a
 * frozen bar, it is marked stale so a consumer can resolve or dismiss it. Call
 * once at startup with the rehydrated runs, all of which have hasLiveSource
 * cleared for the new session.
 */
export function reconcileOnRelaunch(rehydrated: PendingRun[]): LiveActivityState {
  const runs: Record<string, PendingRun> = {};
  for (const run of rehydrated) {
    const orphaned = !run.hasLiveSource && run.phase !== 'settled' && run.phase !== 'failed';
    runs[run.id] = orphaned ? { ...run, phase: 'stale' } : run;
  }
  return { runs };
}

/**
 * Lock-screen-safe projection. This is the ONLY shape a future widget consumer
 * should read: no full address, no raw amount. Amounts are bucketed to a
 * coarse magnitude and addresses to a short suffix so nothing sensitive lands
 * on a lock screen.
 */
export type RedactedRun = {
  id: string;
  kind: RunKind;
  phase: RunPhase;
  progress: number;
  /** e.g. "…a1b2" — never the full address. */
  counterpartyHint: string | null;
  /** Coarse label like "small", "medium", "large" — never the raw amount. */
  amountBucket: 'small' | 'medium' | 'large' | null;
};

function bucketAmount(raw?: string): RedactedRun['amountBucket'] {
  if (!raw) {
    return null;
  }
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) {
    return null;
  }
  if (value < 50) return 'small';
  if (value < 1000) return 'medium';
  return 'large';
}

function addressHint(address?: string): string | null {
  if (!address || address.length < 4) {
    return null;
  }
  return `…${address.slice(-4)}`;
}

/** Projects one run into the redacted, lock-screen-safe shape. */
export function redactRun(run: PendingRun): RedactedRun {
  return {
    id: run.id,
    kind: run.kind,
    phase: run.phase,
    progress: run.progress,
    counterpartyHint: addressHint(run.counterpartyAddress),
    amountBucket: bucketAmount(run.rawAmount),
  };
}

/** The redacted projection of all tracked runs. */
export function redactedRuns(state: LiveActivityState): RedactedRun[] {
  return Object.values(state.runs).map(redactRun);
}
