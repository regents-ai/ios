/**
 * Tail-window pagination for a message transcript.
 *
 * Adapted from hermex ChatTranscriptView.swift:697-732 +
 * CompressionAnchorResolver.swift: the list renders only a tail window of the
 * newest items, and older items load in explicit batches from a top capsule
 * (never an automatic scroll-up trigger). New items appended at the bottom
 * grow the window so the live tail always stays visible.
 *
 * Pure logic, no React. `resolveTailWindow` returns which slice to render and
 * whether an older batch remains, so the screen stays a thin renderer.
 */

/** Items shown before the user asks for more. */
export const TAIL_WINDOW_INITIAL = 30;

/** Items revealed each time the "Load older" capsule is tapped. */
export const TAIL_WINDOW_STEP = 30;

export type TailWindowState = {
  /** How many of the newest items are currently shown. */
  visibleCount: number;
};

export function initialTailWindow(): TailWindowState {
  return { visibleCount: TAIL_WINDOW_INITIAL };
}

/** Reveal one more older batch, capped at the total item count. */
export function loadOlder(state: TailWindowState, totalCount: number): TailWindowState {
  return { visibleCount: Math.min(totalCount, state.visibleCount + TAIL_WINDOW_STEP) };
}

/**
 * Grow the window to keep every newly-appended tail item visible without
 * revealing older history the user has not asked for. When `totalCount` jumps
 * because new items arrived at the bottom, the window grows by the same delta.
 */
export function reconcileAppend(
  state: TailWindowState,
  previousTotal: number,
  totalCount: number
): TailWindowState {
  if (totalCount <= previousTotal) {
    return { visibleCount: Math.min(state.visibleCount, totalCount) };
  }
  const appended = totalCount - previousTotal;
  return { visibleCount: Math.min(totalCount, state.visibleCount + appended) };
}

export type TailWindowResolution<T> = {
  /** The tail slice to render, oldest-first within the window. */
  items: T[];
  /** True when older items remain above the window (show the capsule). */
  hasOlder: boolean;
  /** How many older items are still hidden. */
  hiddenOlderCount: number;
};

/** Resolves the visible tail slice and whether an older batch remains. */
export function resolveTailWindow<T>(all: T[], state: TailWindowState): TailWindowResolution<T> {
  const visibleCount = Math.min(state.visibleCount, all.length);
  const start = all.length - visibleCount;
  return {
    items: all.slice(start),
    hasOlder: start > 0,
    hiddenOlderCount: start,
  };
}
