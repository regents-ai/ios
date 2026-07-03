/**
 * Progress -> success toast state machine.
 *
 * Adapted from hermex GitActionToastOverlay.swift: a mutation shows a spinner
 * toast, morphs in place into a checkmark toast when it lands, and the
 * success toast auto-dismisses after a cancellable window. Each new toast
 * gets a fresh id so the entry animation re-runs; the progress -> success
 * morph keeps its id so the pill swaps content without re-entering.
 */

export const TOAST_AUTO_DISMISS_MS = 6000;

export type ProgressToastPhase = 'progress' | 'success';

export type ProgressToastState = {
  id: number;
  phase: ProgressToastPhase;
  label: string;
  /** Epoch ms after which the toast dismisses itself; null while in progress. */
  dismissAtMs: number | null;
};

let nextToastId = 1;

/** Shows a spinner toast. Always a fresh id, so the entry animation re-runs. */
export function showProgressToast(label: string): ProgressToastState {
  return { id: nextToastId++, phase: 'progress', label, dismissAtMs: null };
}

/**
 * Morphs the current toast into a success checkmark and arms the auto-dismiss
 * window. Keeps the id when morphing from an in-flight progress toast; shows
 * a fresh toast when nothing is on screen.
 */
export function resolveToastSuccess(
  current: ProgressToastState | null,
  label: string,
  nowMs: number
): ProgressToastState {
  return {
    id: current?.phase === 'progress' ? current.id : nextToastId++,
    phase: 'success',
    label,
    dismissAtMs: nowMs + TOAST_AUTO_DISMISS_MS,
  };
}

/** Cancels any toast: user tap, error handoff, or auto-dismiss firing. */
export function dismissToast(): null {
  return null;
}

/** Whether the auto-dismiss window has elapsed. */
export function shouldAutoDismissToast(state: ProgressToastState | null, nowMs: number): boolean {
  return !!state && state.dismissAtMs !== null && nowMs >= state.dismissAtMs;
}
