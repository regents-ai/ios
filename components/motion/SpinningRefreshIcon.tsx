import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';

import { useReducedMotion } from '@/components/motion/useReducedMotion';

type SpinningRefreshIconProps = {
  color: string;
  refreshing: boolean;
  size?: number;
};

export function SpinningRefreshIcon({ color, refreshing, size = 18 }: SpinningRefreshIconProps) {
  const reducedMotionEnabled = useReducedMotion();
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!refreshing || reducedMotionEnabled) {
      spin.stopAnimation();
      spin.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 760,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    loop.start();

    return () => loop.stop();
  }, [reducedMotionEnabled, refreshing, spin]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View style={{ transform: [{ rotate }] }}>
      <Ionicons name="refresh" size={size} color={color} />
    </Animated.View>
  );
}
