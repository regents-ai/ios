import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { useReducedMotion } from '@/components/motion/useReducedMotion';

type LiveValueFlashProps = {
  children: ReactNode;
  nudge?: boolean;
  style?: StyleProp<ViewStyle>;
  value: string | number | null | undefined;
};

export function LiveValueFlash({ children, nudge = false, style, value }: LiveValueFlashProps) {
  const reducedMotionEnabled = useReducedMotion();
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
      useNativeDriver: false,
    }).start();
  }, [flash, reducedMotionEnabled, value]);

  const backgroundColor = flash.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(31, 122, 87, 0)', 'rgba(31, 122, 87, 0.16)'],
  });
  const scale = flash.interpolate({
    inputRange: [0, 1],
    outputRange: [1, nudge ? 1.025 : 1],
  });

  return (
    <Animated.View style={[styles.flashWrap, style, !reducedMotionEnabled && { backgroundColor, transform: [{ scale }] }]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flashWrap: {
    borderRadius: 9,
    marginHorizontal: -4,
    paddingHorizontal: 4,
  },
});
