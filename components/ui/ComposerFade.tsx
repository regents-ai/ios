/**
 * ComposerFade - material fade above the bottom composer.
 *
 * Adapted from hermex ChatTranscriptSupportingViews.swift:435-471: thread
 * content dissolves into the composer instead of hitting a hard border.
 * Rendered as a stack of background-color slices with a smoothstep alpha
 * ramp — no native blur/mask modules are in this app's dev client, so the
 * dissolve is pure RN views.
 */

import { StyleSheet, View } from 'react-native';

export const COMPOSER_FADE_HEIGHT = 28;

const SLICE_COUNT = 8;

// #FBF4DE (COLORS.DARK_BG) as rgb components for the alpha ramp.
const BG_RGB = '251, 244, 222';

function smoothstep(t: number) {
  return t * t * (3 - 2 * t);
}

const SLICES = Array.from({ length: SLICE_COUNT }, (_, index) => {
  const t = (index + 1) / SLICE_COUNT;
  return { key: index, alpha: smoothstep(t) };
});

export function ComposerFade() {
  return (
    <View pointerEvents="none" style={styles.wrap}>
      {SLICES.map((slice) => (
        <View
          key={slice.key}
          style={[styles.slice, { backgroundColor: `rgba(${BG_RGB}, ${slice.alpha.toFixed(3)})` }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: COMPOSER_FADE_HEIGHT,
  },
  slice: {
    flex: 1,
  },
});
