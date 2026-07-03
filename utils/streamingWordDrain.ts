/**
 * Word-cadence stream pacing.
 *
 * Pure logic with no React or React Native dependencies. Text is measured in
 * "word units": maximal runs of non-whitespace characters. Splits only ever
 * happen at whitespace boundaries, so multi-code-unit graphemes (surrogate
 * pairs, emoji, ZWJ sequences, skin-tone modifiers) can never be cut apart —
 * none of their code units are whitespace.
 *
 * - `unitCount` counts the word units in a text.
 * - `splitAtUnitBoundary` cuts a text after the first `n` word units and
 *   guarantees `head + tail === text` for every `n`.
 * - `drainQuota` decides how many units a display tick may reveal, scaling
 *   words-per-tick so a backlog always finishes draining within a lag bound.
 */

// Ported near-verbatim from hermex StreamingWordDrain.swift +
// ChatViewModel.swift (word-cadence drain with lag-bounded catch-up).

/**
 * Upper bound on how long revealed text may trail its source. Whatever the
 * backlog size, `drainQuota` scales the per-tick reveal so the backlog fully
 * drains within this many milliseconds.
 */
export const WORD_DRAIN_MAX_LAG_MS = 2400;

/** Steady reveal pace: one word unit per display tick. */
export const WORD_DRAIN_CADENCE_MS = 48;

const WHITESPACE = /\s/;

/** Counts word units: maximal runs of non-whitespace characters. */
export function unitCount(text: string): number {
  let count = 0;
  let inWord = false;

  for (let index = 0; index < text.length; index += 1) {
    if (WHITESPACE.test(text[index])) {
      inWord = false;
    } else if (!inWord) {
      inWord = true;
      count += 1;
    }
  }

  return count;
}

/**
 * Splits `text` directly after the end of its `n`-th word unit. Whitespace
 * following the boundary stays at the start of the tail, so revealing the
 * next unit later reproduces the input exactly: `head + tail === text`.
 *
 * `n <= 0` returns an empty head; `n >= unitCount(text)` returns the whole
 * text as the head (including any trailing whitespace).
 */
export function splitAtUnitBoundary(text: string, n: number): { head: string; tail: string } {
  if (n <= 0) {
    return { head: '', tail: text };
  }

  let unitsSeen = 0;
  let inWord = false;
  let boundary = text.length;

  for (let index = 0; index < text.length; index += 1) {
    if (WHITESPACE.test(text[index])) {
      if (inWord && unitsSeen === n) {
        boundary = index;
        break;
      }
      inWord = false;
    } else if (!inWord) {
      inWord = true;
      unitsSeen += 1;
    }
  }

  return { head: text.slice(0, boundary), tail: text.slice(boundary) };
}

/**
 * How many word units one display tick may reveal.
 *
 * The steady pace is one unit per tick — the word cadence. A backlog larger
 * than the lag budget (`A = floor(maxLagMs / cadenceMs)` units) would trail
 * the source for longer than `maxLagMs` at that pace, so anything beyond the
 * budget is revealed immediately and only the last `A` units type out at
 * cadence. This gives the exact bound: from any tick, the remaining backlog
 * always drains within `maxLagMs`.
 */
export function drainQuota(backlogUnits: number, cadenceMs: number, maxLagMs: number): number {
  if (backlogUnits <= 0) {
    return 0;
  }

  const safeCadence = Math.max(1, cadenceMs);
  const laggedUnitsAllowed = Math.max(1, Math.floor(maxLagMs / safeCadence));
  const quota = Math.max(1, backlogUnits - laggedUnitsAllowed + 1);

  return Math.min(backlogUnits, quota);
}
