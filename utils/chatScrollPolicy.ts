/**
 * Follow-bottom auto-scroll policy for chat threads.
 *
 * Pure decision logic with no React or React Native dependencies:
 *
 * - The list counts as pinned to the bottom while the distance from the
 *   bottom stays within a threshold: 80pt when idle, widened to 160pt while
 *   new content is streaming in (content growth would otherwise unpin the
 *   reader through no action of their own).
 * - Leaving the pinned state requires an extra 64pt of hysteresis beyond the
 *   threshold, so small wiggles never flip the reader into "reading older".
 *   Returning within the threshold re-pins.
 * - A short cooldown (250ms) after the user touches the list pauses
 *   auto-scroll so an incoming message never fights an in-progress gesture.
 *   Explicit actions such as the jump-to-latest control bypass the cooldown.
 */

export type ChatScrollMode = 'following' | 'readingOlder';

export type ChatScrollState = {
  mode: ChatScrollMode;
  touchCooldownUntilMs: number;
};

export const FOLLOW_BOTTOM_THRESHOLD_IDLE_PT = 80;
export const FOLLOW_BOTTOM_THRESHOLD_STREAMING_PT = 160;
export const READING_OLDER_HYSTERESIS_PT = 64;
export const USER_TOUCH_COOLDOWN_MS = 250;

export function createChatScrollState(): ChatScrollState {
  return { mode: 'following', touchCooldownUntilMs: 0 };
}

export function followBottomThreshold(streaming: boolean): number {
  return streaming ? FOLLOW_BOTTOM_THRESHOLD_STREAMING_PT : FOLLOW_BOTTOM_THRESHOLD_IDLE_PT;
}

type ChatScrollInput = {
  distanceFromBottom: number;
  streaming: boolean;
};

/** Applies a scroll position sample. Returns the same state when nothing changes. */
export function trackChatScroll(state: ChatScrollState, input: ChatScrollInput): ChatScrollState {
  const threshold = followBottomThreshold(input.streaming);

  if (state.mode === 'following') {
    return input.distanceFromBottom > threshold + READING_OLDER_HYSTERESIS_PT
      ? { ...state, mode: 'readingOlder' }
      : state;
  }

  return input.distanceFromBottom <= threshold ? { ...state, mode: 'following' } : state;
}

/** Records the start of a user touch, opening the auto-scroll cooldown window. */
export function noteUserScrollStart(state: ChatScrollState, nowMs: number): ChatScrollState {
  return { ...state, touchCooldownUntilMs: nowMs + USER_TOUCH_COOLDOWN_MS };
}

/** Explicit return to the newest message. Bypasses the touch cooldown. */
export function jumpToLatest(state: ChatScrollState): ChatScrollState {
  if (state.mode === 'following' && state.touchCooldownUntilMs === 0) {
    return state;
  }

  return { mode: 'following', touchCooldownUntilMs: 0 };
}

export function shouldAutoScroll(state: ChatScrollState, nowMs: number): boolean {
  return state.mode === 'following' && nowMs >= state.touchCooldownUntilMs;
}

export function shouldShowJumpToLatest(state: ChatScrollState): boolean {
  return state.mode === 'readingOlder';
}
