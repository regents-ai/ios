/**
 * HalftoneBackground - static CMYK-style halftone dot pattern.
 *
 * The app-surface artwork treatment from STYLE.md ("Static contexts use a CSS
 * halftone dot pattern"). No shaders, no native dependency, no animation — a
 * fixed grid of small dots mixed from the foreground at low alpha, so it reads
 * as fine print texture on the near-black ground in dark and as a faint dotted
 * paper grain in light. Absolutely fills its parent behind content; pass
 * `pointerEvents="none"` is handled internally.
 *
 * Performance: a bounded grid of plain Views (no per-frame work, no offscreen
 * cost). Dot count is capped so even a full-screen fill stays cheap.
 */

import { useMemo } from 'react';
import { StyleSheet, View, type LayoutRectangle, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

type HalftoneBackgroundProps = {
  /** Dot pitch in px (center-to-center). Larger = sparser. */
  spacing?: number;
  /** Dot diameter in px. */
  dotSize?: number;
  /** Dot opacity 0..1 over the ground. */
  opacity?: number;
  style?: StyleProp<ViewStyle>;
  /** Explicit area to tile; defaults to filling the parent. */
  area?: Pick<LayoutRectangle, 'width' | 'height'>;
};

// Hard cap so a large fill can never spawn a runaway number of Views.
const MAX_DOTS = 900;

export function HalftoneBackground({
  spacing = 16,
  dotSize = 2,
  opacity = 0.06,
  style,
  area = { width: 420, height: 900 },
}: HalftoneBackgroundProps) {
  const { colors } = useTheme();

  const dots = useMemo(() => {
    const cols = Math.max(1, Math.ceil(area.width / spacing));
    const rows = Math.max(1, Math.ceil(area.height / spacing));
    const positions: { key: string; left: number; top: number }[] = [];
    for (let row = 0; row < rows && positions.length < MAX_DOTS; row += 1) {
      // Offset alternate rows by half a pitch — the classic halftone lattice.
      const offset = row % 2 === 0 ? 0 : spacing / 2;
      for (let col = 0; col < cols && positions.length < MAX_DOTS; col += 1) {
        positions.push({ key: `${row}-${col}`, left: col * spacing + offset, top: row * spacing });
      }
    }
    return positions;
  }, [area.width, area.height, spacing]);

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.clip, style]}>
      {dots.map((dot) => (
        <View
          key={dot.key}
          style={{
            position: 'absolute',
            left: dot.left,
            top: dot.top,
            width: dotSize,
            height: dotSize,
            borderRadius: dotSize / 2,
            backgroundColor: colors.text,
            opacity,
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
});
