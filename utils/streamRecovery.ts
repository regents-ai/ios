/**
 * Visible stream-recovery state machine.
 *
 * Adapted from hermex ChatStreamCoordinator.swift + SSEClient.swift. This app
 * follows a live thread by polling rather than a raw socket, so "the stream"
 * is the poll loop. This classifies the loop into three visible states:
 *
 *   live         - a recent poll succeeded; nothing to show.
 *   checking     - one poll failed, or we just returned to foreground and are
 *                  re-syncing from the cursor; a soft "Checking..." pill.
 *   reconnecting - repeated failures; a "Reconnecting..." pill.
 *
 * Pure logic, no React or timers, so the transitions are unit-testable.
 */

export type StreamRecoveryState = 'live' | 'checking' | 'reconnecting';

/** Consecutive failures before we escalate from checking to reconnecting. */
export const RECONNECT_THRESHOLD = 2;

export type StreamRecoveryStatus = {
  state: StreamRecoveryState;
  consecutiveFailures: number;
};

export const initialStreamRecovery: StreamRecoveryStatus = {
  state: 'live',
  consecutiveFailures: 0,
};

/** A poll completed successfully: back to live, failure count cleared. */
export function onPollSuccess(): StreamRecoveryStatus {
  return { state: 'live', consecutiveFailures: 0 };
}

/** A poll threw or timed out: escalate checking -> reconnecting. */
export function onPollFailure(current: StreamRecoveryStatus): StreamRecoveryStatus {
  const consecutiveFailures = current.consecutiveFailures + 1;
  return {
    state: consecutiveFailures >= RECONNECT_THRESHOLD ? 'reconnecting' : 'checking',
    consecutiveFailures,
  };
}

/**
 * The app returned to the foreground: show "Checking..." while we resume from
 * the cursor, unless we were already mid-reconnect (keep that louder state).
 */
export function onForegroundResume(current: StreamRecoveryStatus): StreamRecoveryStatus {
  if (current.state === 'reconnecting') {
    return current;
  }
  return { state: 'checking', consecutiveFailures: current.consecutiveFailures };
}

/** Copy for the recovery pill, or null when the stream is live. */
export function streamRecoveryLabel(state: StreamRecoveryState): string | null {
  switch (state) {
    case 'live':
      return null;
    case 'checking':
      return 'Checking for new messages...';
    case 'reconnecting':
      return 'Reconnecting...';
  }
}
