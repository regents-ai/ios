import { useEffect, useRef } from 'react';
import { Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';

import { useReducedMotion } from '@/components/motion/useReducedMotion';

type ShimmerBlockProps = {
  style?: StyleProp<ViewStyle>;
};

export function ShimmerBlock({ style }: ShimmerBlockProps) {
  const reducedMotionEnabled = useReducedMotion();
  const opacity = useRef(new Animated.Value(0.48)).current;

  useEffect(() => {
    if (reducedMotionEnabled) {
      opacity.stopAnimation();
      opacity.setValue(0.62);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.9,
          duration: 620,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.48,
          duration: 620,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );

    loop.start();

    return () => loop.stop();
  }, [opacity, reducedMotionEnabled]);

  return <Animated.View style={[style, { opacity }]} />;
}
