import { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useReducedMotion } from '@/components/motion/useReducedMotion';
import { COLORS } from '@/constants/Colors';

const DOT_MIN_SCALE = 0.86;
const DOT_MAX_SCALE = 1.16;
const DOT_MIN_OPACITY = 0.55;
const DOT_MAX_OPACITY = 0.95;
const DOT_STATIC_OPACITY = 0.75;
const BREATH_DURATION_MS = 900;

type TypingIndicatorProps = {
  color?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * A single breathing dot shown while the agent is composing a reply.
 * Under reduced motion the dot holds still at a muted opacity.
 */
export function TypingIndicator({
  color = COLORS.TEXT_SECONDARY,
  size = 8,
  style,
}: TypingIndicatorProps) {
  const reducedMotionEnabled = useReducedMotion();
  const phase = useSharedValue(0);

  useEffect(() => {
    if (reducedMotionEnabled) {
      cancelAnimation(phase);
      phase.value = 0;
      return;
    }

    phase.value = 0;
    phase.value = withRepeat(
      withTiming(1, { duration: BREATH_DURATION_MS, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );

    return () => cancelAnimation(phase);
  }, [phase, reducedMotionEnabled]);

  const breathingStyle = useAnimatedStyle(() => ({
    opacity: DOT_MIN_OPACITY + phase.value * (DOT_MAX_OPACITY - DOT_MIN_OPACITY),
    transform: [{ scale: DOT_MIN_SCALE + phase.value * (DOT_MAX_SCALE - DOT_MIN_SCALE) }],
  }));

  const dotShape = {
    width: size,
    height: size,
    borderRadius: size / 2,
    backgroundColor: color,
  };

  return (
    <View accessible accessibilityLabel="Agent is typing" style={[styles.container, style]}>
      {reducedMotionEnabled ? (
        <View style={[dotShape, styles.staticDot]} />
      ) : (
        <Animated.View style={[dotShape, breathingStyle]} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },
  staticDot: {
    opacity: DOT_STATIC_OPACITY,
  },
});
