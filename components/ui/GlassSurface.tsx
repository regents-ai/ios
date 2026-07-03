/**
 * GlassSurface - the one surface view for floating chrome (toasts, sheets).
 *
 * Adapted from hermex AdaptiveGlassModifier.swift. Resolves its treatment
 * from the glass ladder: a real frosted BlurView normally, opaque tint with a
 * contrast stroke when the person has Reduce Transparency on. Live-updating.
 */

import { BlurView } from 'expo-blur';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { resolveGlassSurface, type GlassLevel } from '@/utils/glassSurface';

export function useReduceTransparency() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let isMounted = true;

    AccessibilityInfo.isReduceTransparencyEnabled().then((value) => {
      if (isMounted) {
        setEnabled(value);
      }
    });

    const subscription = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setEnabled);

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, []);

  return enabled;
}

type GlassSurfaceProps = {
  level?: GlassLevel;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

export function GlassSurface({ level = 'pill', style, children }: GlassSurfaceProps) {
  const reduceTransparency = useReduceTransparency();
  const resolution = resolveGlassSurface(level, reduceTransparency);

  if (resolution.mode === 'opaque') {
    return (
      <View
        style={[
          {
            backgroundColor: resolution.backgroundColor,
            borderColor: resolution.borderColor,
            borderWidth: resolution.borderWidth,
          },
          style,
        ]}
      >
        {children}
      </View>
    );
  }

  // Blur rung: the BlurView fills behind the content, clipped to the caller's
  // radius. A warm wash over it keeps the surface tint reading through.
  return (
    <View
      style={[
        styles.blurContainer,
        { borderColor: resolution.borderColor, borderWidth: resolution.borderWidth },
        style,
      ]}
    >
      <BlurView
        intensity={resolution.intensity}
        tint={resolution.tint}
        style={StyleSheet.absoluteFill}
      />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: resolution.overlayColor }]} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  blurContainer: {
    overflow: 'hidden',
  },
});
