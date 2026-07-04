/**
 * Live Activity bridge — app-side lifecycle for pending-run Live Activities.
 *
 * Owns the runtime instance of the headless model (utils/liveActivityModel.ts):
 * it holds the current LiveActivityState, persists it across launches, sweeps
 * for staleness, and mirrors every state change onto iOS ActivityKit through
 * an OPTIONAL native module.
 *
 * Capability check: the native module ("RegentsLiveActivity") does not exist
 * yet — it ships together with the staged lock-screen widget target in
 * targets/pending-runs once provisioning is approved. Until then every native
 * call is a no-op and this bridge only maintains + persists model state, so
 * product code can wire producers today without any native dependency.
 *
 * Redaction: the ONLY shape handed to the native side is RedactedRun (last-4
 * address hint + coarse amount bucket). Full addresses and raw amounts stay in
 * the in-app model and its local persistence; they never cross the bridge.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

import {
  finishRun,
  initialLiveActivityState,
  markStale,
  reconcileOnRelaunch,
  redactedRuns,
  startRun,
  updateProgress,
  type LiveActivityState,
  type PendingRun,
  type RedactedRun,
  type RunKind,
} from './liveActivityModel';
import { computeActivityOps, orphanNativeActivityIds } from './liveActivitySync';

/** Surface the future native module must implement. Redacted payloads only. */
type NativeLiveActivityModule = {
  areActivitiesEnabled(): boolean;
  startActivity(run: RedactedRun): Promise<void>;
  updateActivity(run: RedactedRun): Promise<void>;
  endActivity(id: string): Promise<void>;
  listActivityIds(): Promise<string[]>;
};

const STORAGE_KEY = 'regents.liveActivity.runs.v1';
const STALE_SWEEP_INTERVAL_MS = 30_000;

let state: LiveActivityState = initialLiveActivityState;
/** The redacted projection last mirrored to ActivityKit. */
let mirrored: RedactedRun[] = [];
let staleTimer: ReturnType<typeof setInterval> | null = null;

function getNativeModule(): NativeLiveActivityModule | null {
  if (Platform.OS !== 'ios') {
    return null;
  }
  try {
    const native = requireOptionalNativeModule<NativeLiveActivityModule>('RegentsLiveActivity');
    if (!native || !native.areActivitiesEnabled()) {
      return null;
    }
    return native;
  } catch {
    return null;
  }
}

function persist(): void {
  const runs = Object.values(state.runs);
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(runs)).catch(() => {});
}

function syncNative(): void {
  const next = redactedRuns(state);
  const ops = computeActivityOps(mirrored, next);
  mirrored = next;
  if (ops.length === 0) {
    return;
  }
  const native = getNativeModule();
  if (!native) {
    return;
  }
  for (const op of ops) {
    if (op.op === 'start') {
      native.startActivity(op.run).catch(() => {});
    } else if (op.op === 'update') {
      native.updateActivity(op.run).catch(() => {});
    } else {
      native.endActivity(op.id).catch(() => {});
    }
  }
}

function syncStaleTimer(): void {
  const hasRuns = Object.keys(state.runs).length > 0;
  if (hasRuns && staleTimer === null) {
    staleTimer = setInterval(() => {
      applyState(markStale(state, Date.now()));
    }, STALE_SWEEP_INTERVAL_MS);
  } else if (!hasRuns && staleTimer !== null) {
    clearInterval(staleTimer);
    staleTimer = null;
  }
}

function applyState(next: LiveActivityState): void {
  if (next === state) {
    return;
  }
  state = next;
  syncNative();
  persist();
  syncStaleTimer();
}

/** Starts tracking (and, when supported, displaying) a pending run. */
export function startPendingRun(input: {
  id: string;
  kind: RunKind;
  counterpartyAddress?: string;
  rawAmount?: string;
  currency?: string;
}): void {
  applyState(startRun(state, { ...input, createdAtMs: Date.now() }));
}

/** Applies a progress update; the model throttles churn internally. */
export function updatePendingRunProgress(id: string, progress: number): void {
  applyState(updateProgress(state, id, progress, Date.now()));
}

/** Ends a run — the mirrored activity is ended on the lock screen too. */
export function finishPendingRun(id: string, outcome: 'settled' | 'failed'): void {
  applyState(finishRun(state, id, outcome, Date.now()));
}

/**
 * Hydrates persisted runs at app launch and reconciles orphans, in both
 * directions: runs with no live source this session go stale (model rule),
 * and native activities with no matching run are ended so nothing dangles on
 * the lock screen. Call once from app bootstrap.
 */
export async function hydrateLiveActivityRuns(): Promise<void> {
  let rehydrated: PendingRun[] = [];
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        rehydrated = parsed.map((run: PendingRun) => ({ ...run, hasLiveSource: false }));
      }
    }
  } catch {
    rehydrated = [];
  }

  state = reconcileOnRelaunch(rehydrated);
  persist();

  const native = getNativeModule();
  if (native) {
    try {
      const nativeIds = await native.listActivityIds();
      for (const id of orphanNativeActivityIds(nativeIds, state)) {
        native.endActivity(id).catch(() => {});
      }
      // Activities that survived relaunch mirror the reconciled (now stale)
      // phase instead of a frozen progress bar. Runs without a surviving
      // activity are NOT restarted: popping a "status unknown" card onto the
      // lock screen at launch would be noise, not signal.
      const surviving = new Set(nativeIds.filter((id) => state.runs[id]));
      mirrored = redactedRuns(state).filter((run) => surviving.has(run.id));
      for (const run of mirrored) {
        native.updateActivity(run).catch(() => {});
      }
    } catch {
      mirrored = [];
    }
  } else {
    mirrored = [];
  }

  syncStaleTimer();
}
