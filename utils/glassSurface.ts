/**
 * Adaptive glass surface ladder.
 *
 * Adapted from hermex AdaptiveGlassModifier.swift: one resolver decides how a
 * floating surface renders. The ladder steps translucent tint -> opaque tint
 * when Reduce Transparency is on, and always keeps a contrast stroke so the
 * surface separates from whatever scrolls beneath it. No native blur module
 * ships in this app, so the translucent rung is a tinted wash, not a blur.
 */

export type GlassLevel = 'pill' | 'sheet';

export type GlassSurfaceStyle = {
  backgroundColor: string;
  borderColor: string;
  borderWidth: number;
};

// COLORS.CARD_BG (#F2E9D0) as rgb components for the translucent rungs.
const SURFACE_RGB = '242, 233, 208';
const OPAQUE_SURFACE = '#F2E9D0';

const STROKE = '#D7C7A1'; // COLORS.BORDER
const CONTRAST_STROKE = '#8A7A52'; // darker stroke for the opaque rung

const LEVEL_ALPHA: Record<GlassLevel, number> = {
  pill: 0.88,
  sheet: 0.96,
};

export function resolveGlassSurface(level: GlassLevel, reduceTransparency: boolean): GlassSurfaceStyle {
  if (reduceTransparency) {
    return { backgroundColor: OPAQUE_SURFACE, borderColor: CONTRAST_STROKE, borderWidth: 1 };
  }

  return {
    backgroundColor: `rgba(${SURFACE_RGB}, ${LEVEL_ALPHA[level]})`,
    borderColor: STROKE,
    borderWidth: 1,
  };
}
