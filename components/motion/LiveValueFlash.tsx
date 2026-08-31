import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useReducedMotion } from '@/components/motion/useReducedMotion';
import { useTheme } from '@/theme/ThemeProvider';

type LiveValueFlashProps = {
  children: ReactNode;
  nudge?: boolean;
  style?: StyleProp<ViewStyle>;
  value: string | number | null | undefined;
};

export function LiveValueFlash({ children, nudge = false, style, value }: LiveValueFlashProps) {
  const reducedMotionEnabled = useReducedMotion();
  const { colors } = useTheme();
  const flash = useRef(new Animated.Value(0)).current;
  const previousValue = useRef(value);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      previousValue.current = value;
      return;
    }

    if (previousValue.current === value) {
      return;
    }

    previousValue.current = value;

    if (reducedMotionEnabled) {
      return;
    }

    flash.stopAnimation();
    flash.setValue(1);
    Animated.timing(flash, {
      toValue: 0,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [flash, reducedMotionEnabled, value]);

  const flashOpacity = flash.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.16],
  });
  const scale = flash.interpolate({
    inputRange: [0, 1],
    outputRange: [1, nudge ? 1.025 : 1],
  });

  return (
    <Animated.View style={[styles.flashWrap, style, !reducedMotionEnabled && { transform: [{ scale }] }]}>
      {!reducedMotionEnabled ? (
        <Animated.View
          pointerEvents="none"
          testID="live-value-flash-tint"
          style={[
            StyleSheet.absoluteFillObject,
            styles.flashTint,
            { backgroundColor: colors.success, opacity: flashOpacity },
          ]}
        />
      ) : null}
      <View style={styles.flashContent}>{children}</View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flashWrap: {
    borderRadius: 9,
    marginHorizontal: -4,
    overflow: 'hidden',
    paddingHorizontal: 4,
    position: 'relative',
  },
  flashTint: {
    borderRadius: 9,
  },
  flashContent: {
    position: 'relative',
  },
});
