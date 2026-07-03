/**
 * Pinned local notices that flush into the transcript.
 *
 * Adapted from hermex ChatViewModel.swift:4055: a locally-initiated action
 * (e.g. "Transfer submitted") pins an ephemeral notice above the composer
 * while it is pending. When it confirms, the notice flushes into the timeline
 * as a permanent entry; when it fails, it clears. This keeps optimistic local
 * state visible without faking a server event until it is real.
 *
 * Pure reducer, no React or timers, so the lifecycle is unit-testable.
 */

export type LocalNoticeStatus = 'pending' | 'confirmed' | 'failed';

export type LocalNotice = {
  id: string;
  /** Copy shown while pinned, e.g. "Transfer submitted". */
  pendingLabel: string;
  /** Copy for the permanent timeline entry once confirmed. */
  confirmedLabel: string;
  status: LocalNoticeStatus;
  createdAtMs: number;
};

export type FlushedNotice = {
  id: string;
  label: string;
  atMs: number;
};

export type LocalNoticeState = {
  /** Notices still pinned above the composer (pending). */
  pinned: LocalNotice[];
  /** Confirmed notices that have flushed into the transcript. */
  flushed: FlushedNotice[];
};

export const initialLocalNotices: LocalNoticeState = { pinned: [], flushed: [] };

/** Pin a new pending notice above the composer. */
export function pinNotice(
  state: LocalNoticeState,
  notice: Omit<LocalNotice, 'status'>
): LocalNoticeState {
  return {
    ...state,
    pinned: [...state.pinned, { ...notice, status: 'pending' }],
  };
}

/**
 * Confirm a pinned notice: unpin it and materialize a permanent transcript
 * entry. A no-op if the id is not currently pinned (idempotent).
 */
export function confirmNotice(
  state: LocalNoticeState,
  id: string,
  atMs: number
): LocalNoticeState {
  const notice = state.pinned.find((entry) => entry.id === id);
  if (!notice) {
    return state;
  }
  return {
    pinned: state.pinned.filter((entry) => entry.id !== id),
    flushed: [...state.flushed, { id, label: notice.confirmedLabel, atMs }],
  };
}

/** Fail a pinned notice: unpin it, nothing flushes to the transcript. */
export function failNotice(state: LocalNoticeState, id: string): LocalNoticeState {
  return { ...state, pinned: state.pinned.filter((entry) => entry.id !== id) };
}
