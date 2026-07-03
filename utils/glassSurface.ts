/**
 * Adaptive glass surface ladder.
 *
 * Adapted from hermex AdaptiveGlassModifier.swift: one resolver decides how a
 * floating surface renders. The ladder steps a real frosted blur -> opaque
 * tint when Reduce Transparency is on, and always keeps a contrast stroke so
 * the surface separates from whatever scrolls beneath it.
 *
 * Themed: the caller passes the active theme's surface/stroke inputs so the
 * glass reads correctly in both light and dark (near-black surface in dark).
 */

export type GlassLevel = 'pill' | 'sheet';

/** Theme-derived inputs for the glass ladder. */
export type GlassSurfaceInputs = {
  /** Blur tint: 'dark' on the near-black ground, 'light' on paper. */
  tint: 'light' | 'dark';
  /** rgb components (e.g. "23, 23, 23") for the wash over the blur. */
  surfaceRgb: string;
  /** Solid surface color for the opaque (Reduce Transparency) rung. */
  opaqueSurface: string;
  /** Hairline stroke for the blur rung. */
  stroke: string;
  /** Stronger contrast stroke for the opaque rung. */
  contrastStroke: string;
};

export type GlassSurfaceResolution =
  | {
      // Real frosted blur (expo-blur BlurView).
      mode: 'blur';
      intensity: number;
      tint: 'light' | 'dark' | 'default';
      // Slight wash over the blur so the surface tint reads through.
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

// Blur intensity and wash opacity per rung: a pill floats lighter than a sheet.
const LEVEL_BLUR: Record<GlassLevel, { intensity: number; overlayAlpha: number }> = {
  pill: { intensity: 40, overlayAlpha: 0.55 },
  sheet: { intensity: 60, overlayAlpha: 0.7 },
};

export function resolveGlassSurface(
  level: GlassLevel,
  reduceTransparency: boolean,
  inputs: GlassSurfaceInputs,
): GlassSurfaceResolution {
  if (reduceTransparency) {
    return {
      mode: 'opaque',
      backgroundColor: inputs.opaqueSurface,
      borderColor: inputs.contrastStroke,
      borderWidth: 1,
    };
  }

  const rung = LEVEL_BLUR[level];
  return {
    mode: 'blur',
    intensity: rung.intensity,
    tint: inputs.tint,
    overlayColor: `rgba(${inputs.surfaceRgb}, ${rung.overlayAlpha})`,
    borderColor: inputs.stroke,
    borderWidth: 1,
  };
}
