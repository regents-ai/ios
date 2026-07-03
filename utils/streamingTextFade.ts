/**
 * Per-word fade cascade geometry.
 *
 * Adapted from hermex StreamingTextFade.swift: newly revealed words fade in on
 * a shared stamp-chain that compresses when words arrive fast, so a burst does
 * not leave a long trail of half-faded nodes. The RN port keeps a bounded fade
 * window — only the last `FADE_WINDOW` words animate; everything before them is
 * absorbed into one solid text node, capping the live Text-node count.
 *
 * Composes with the #5 word drain (utils/streamingWordDrain): the drain
 * decides which words are visible, this decides how the newest ones fade in.
 *
 * Pure logic, no React — so the cascade is unit-testable.
 */

/** Newest N words animate; older words are settled solid text. */
export const FADE_WINDOW = 6;

/** How long one word takes to reach full opacity. */
export const FADE_DURATION_MS = 220;

/**
 * Stamp spacing at a steady pace. When words arrive faster than this, the
 * chain compresses (stamps clamp toward `now`) so the tail never trails by
 * more than the fade window — matching the Swift stamp-chain behavior.
 */
export const FADE_STAMP_SPACING_MS = 55;

/**
 * Assigns each revealed word a fade-start stamp on a chain. `previousStamps`
 * carries stamps already assigned (keyed by word index) so a word's fade-in
 * start stays stable across ticks. New words in the same tick chain off each
 * other at `FADE_STAMP_SPACING_MS`, so a fast burst spaces out into a cascade
 * instead of all fading at once; a slow drip just stamps at arrival time.
 * Returns the full stamp map for the current word count.
 */
export function advanceFadeStamps(
  previousStamps: ReadonlyMap<number, number>,
  wordCount: number,
  nowMs: number
): Map<number, number> {
  const stamps = new Map<number, number>();
  let chainHead = nowMs;

  for (let index = 0; index < wordCount; index += 1) {
    const existing = previousStamps.get(index);
    if (existing !== undefined) {
      stamps.set(index, existing);
      chainHead = Math.max(chainHead, existing + FADE_STAMP_SPACING_MS);
      continue;
    }

    // New word: stamp it at the chain head — the later of `now` and one spacing
    // past the previous new word — so a same-tick burst cascades in order.
    const stamp = Math.max(nowMs, chainHead);
    stamps.set(index, stamp);
    chainHead = stamp + FADE_STAMP_SPACING_MS;
  }

  return stamps;
}

/** 0..1 opacity for a word given its fade-start stamp and the current time. */
export function fadeOpacity(stampMs: number, nowMs: number): number {
  if (nowMs <= stampMs) {
    return 0;
  }
  const progress = (nowMs - stampMs) / FADE_DURATION_MS;
  return progress >= 1 ? 1 : progress;
}

/**
 * Whether a word index is old enough to be absorbed into the settled solid
 * block instead of rendered as its own animated node.
 */
export function isSettledWord(index: number, wordCount: number): boolean {
  return index < wordCount - FADE_WINDOW;
}
