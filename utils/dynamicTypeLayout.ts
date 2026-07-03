/**
 * Dynamic-type-aware layout switching.
 *
 * Adapted from hermex ToolActivityGroupView.swift:49-76: dense rows that lay
 * out horizontally at normal text sizes switch to a stacked vertical layout at
 * accessibility font scales, and paddings scale with the font so nothing
 * clips. Pure math over a font scale (from PixelRatio.getFontScale()), so the
 * threshold and scaling are unit-testable and the components stay thin.
 */

/** At or above this font scale, dense rows stack vertically. */
export const STACK_FONT_SCALE = 1.3;

/** Font scale is clamped here so paddings never blow up unboundedly. */
export const MAX_LAYOUT_FONT_SCALE = 1.6;

export type DynamicTypeLayout = {
  /** 'row' at normal sizes, 'stacked' at accessibility sizes. */
  direction: 'row' | 'stacked';
  /** Multiplier to apply to base paddings/gaps. */
  spacingScale: number;
};

export function resolveDynamicTypeLayout(fontScale: number): DynamicTypeLayout {
  const safeScale = Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1;
  const clamped = Math.min(MAX_LAYOUT_FONT_SCALE, Math.max(1, safeScale));
  return {
    direction: safeScale >= STACK_FONT_SCALE ? 'stacked' : 'row',
    spacingScale: clamped,
  };
}

/** Scales a base spacing value by the layout's spacing scale, rounded. */
export function scaleSpacing(base: number, layout: DynamicTypeLayout): number {
  return Math.round(base * layout.spacingScale);
}
