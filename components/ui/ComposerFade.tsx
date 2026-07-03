/**
 * ComposerFade - real frosted material fade above the bottom composer.
 *
 * Adapted from hermex ChatTranscriptSupportingViews.swift:435-471: thread
 * content dissolves into the composer instead of hitting a hard border. A
 * MaskedView applies a smoothstep alpha ramp (transparent at the top, opaque
 * at the bottom) over a real expo-blur BlurView, so the bottom of the list
 * frosts into the composer.
 */

import MaskedView from '@react-native-masked-view/masked-view';
import { BlurView } from 'expo-blur';
import { StyleSheet, View } from 'react-native';

import { COMPOSER_FADE_HEIGHT, composerFadeSlices } from '@/utils/composerFade';

export { COMPOSER_FADE_HEIGHT };

const SLICES = composerFadeSlices();

function FadeMask() {
  return (
    <View style={styles.fill}>
      {SLICES.map((slice) => (
        <View key={slice.key} style={[styles.slice, { opacity: slice.alpha }]} />
      ))}
    </View>
  );
}

export function ComposerFade() {
  return (
    <MaskedView pointerEvents="none" style={styles.wrap} maskElement={<FadeMask />}>
      <BlurView intensity={40} tint="light" style={styles.fill} />
    </MaskedView>
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
  fill: {
    flex: 1,
  },
  slice: {
    flex: 1,
    // Any solid color works: MaskedView uses the mask's alpha, not its hue.
    backgroundColor: '#000',
  },
});
