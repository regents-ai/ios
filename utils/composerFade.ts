/**
 * Composer fade mask geometry.
 *
 * Adapted from hermex ChatTranscriptSupportingViews.swift:435-471: the mask
 * ramps from transparent at the top (thread content stays sharp) to opaque at
 * the bottom (content fully dissolves into the frosted composer). A smoothstep
 * curve avoids a hard banding edge. Pure math so the ramp is unit-testable;
 * the component feeds these alphas to a MaskedView over a real BlurView.
 */

export const COMPOSER_FADE_HEIGHT = 28;

const SLICE_COUNT = 12;

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

export type FadeSlice = { key: number; alpha: number };

/** Mask alphas top -> bottom: 0 (sharp) ramping to 1 (fully frosted). */
export function composerFadeSlices(count: number = SLICE_COUNT): FadeSlice[] {
  return Array.from({ length: count }, (_, index) => ({
    key: index,
    alpha: smoothstep((index + 1) / count),
  }));
}
