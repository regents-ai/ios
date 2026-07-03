/**
 * Adaptive glass surface ladder.
 *
 * Adapted from hermex AdaptiveGlassModifier.swift: one resolver decides how a
 * floating surface renders. The ladder steps a real frosted blur -> opaque
 * tint when Reduce Transparency is on, and always keeps a contrast stroke so
 * the surface separates from whatever scrolls beneath it.
 */

export type GlassLevel = 'pill' | 'sheet';

export type GlassSurfaceResolution =
  | {
      // Real frosted blur (expo-blur BlurView).
      mode: 'blur';
      intensity: number;
      tint: 'light' | 'dark' | 'default';
      // Slight wash over the blur so the warm surface tint reads through.
      overlayColor: string;
      borderColor: string;
      borderWidth: number;
    }
  | {
      // Reduce Transparency: opaque surface, no blur, stronger outline.
      mode: 'opaque';
      backgroundColor: string;
      borderColor: string;
      borderWidth: number;
    };

// COLORS.CARD_BG (#F2E9D0) as rgb components for the wash over the blur.
const SURFACE_RGB = '242, 233, 208';
const OPAQUE_SURFACE = '#F2E9D0';

const STROKE = '#D7C7A1'; // COLORS.BORDER
const CONTRAST_STROKE = '#8A7A52'; // darker stroke for the opaque rung

// Blur intensity and wash opacity per rung: a pill floats lighter than a sheet.
const LEVEL_BLUR: Record<GlassLevel, { intensity: number; overlayAlpha: number }> = {
  pill: { intensity: 40, overlayAlpha: 0.55 },
  sheet: { intensity: 60, overlayAlpha: 0.7 },
};

export function resolveGlassSurface(
  level: GlassLevel,
  reduceTransparency: boolean
): GlassSurfaceResolution {
  if (reduceTransparency) {
    return {
      mode: 'opaque',
      backgroundColor: OPAQUE_SURFACE,
      borderColor: CONTRAST_STROKE,
      borderWidth: 1,
    };
  }

  const rung = LEVEL_BLUR[level];
  return {
    mode: 'blur',
    intensity: rung.intensity,
    tint: 'light',
    overlayColor: `rgba(${SURFACE_RGB}, ${rung.overlayAlpha})`,
    borderColor: STROKE,
    borderWidth: 1,
  };
}
