import { FONTS } from '@/constants/Typography';
import { useReducedMotion } from '@/components/motion/useReducedMotion';
import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

type StatusPillProps = {
  label: string;
  color: string;
  backgroundColor: string;
  borderColor?: string;
  showDot?: boolean;
  compact?: boolean;
  pulseDot?: boolean;
};

function shouldPulseDot(label: string) {
  const normalizedLabel = label.toLowerCase();
  return ['live', 'working', 'running', 'active', 'steady', 'online', 'track'].some((status) => normalizedLabel.includes(status));
}

function StatusDot({ color, pulsing }: { color: string; pulsing: boolean }) {
  const reducedMotionEnabled = useReducedMotion();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!pulsing || reducedMotionEnabled) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 840,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 840,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );

    loop.start();

    return () => {
      loop.stop();
    };
  }, [pulse, pulsing, reducedMotionEnabled]);

  const haloOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.1, 0.32],
  });
  const haloScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.85],
  });

  return (
    <View style={styles.dotWrap}>
      {pulsing && !reducedMotionEnabled ? (
        <Animated.View
          style={[
            styles.dotHalo,
            {
              backgroundColor: color,
              opacity: haloOpacity,
              transform: [{ scale: haloScale }],
            },
          ]}
        />
      ) : null}
      <View style={[styles.dot, { backgroundColor: color }]} />
    </View>
  );
}

export function StatusPill({ label, color, backgroundColor, borderColor, showDot = false, compact = false, pulseDot }: StatusPillProps) {
  const shouldPulse = pulseDot ?? shouldPulseDot(label);

  return (
    <View
      style={[
        styles.pill,
        compact && styles.compactPill,
        {
          backgroundColor,
          borderColor: borderColor ?? backgroundColor,
        },
      ]}
    >
      {showDot ? <StatusDot color={color} pulsing={shouldPulse} /> : null}
      <Text style={[styles.label, compact && styles.compactLabel, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  compactPill: {
    paddingVertical: 5,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotHalo: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotWrap: {
    width: 12,
    height: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    flexShrink: 1,
    fontSize: 12,
    fontFamily: FONTS.body,
  },
  compactLabel: {
    fontSize: 11,
  },
});
