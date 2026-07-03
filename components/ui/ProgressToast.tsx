/**
 * ProgressToast - spinner pill that morphs into a checkmark pill.
 *
 * Adapted from hermex GitActionToastOverlay.swift. Entry animation re-runs
 * per toast id; the progress -> success morph swaps content in place. Tap
 * anywhere on the pill to dismiss early; success auto-dismisses after its
 * cancellable window (see utils/progressToast).
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Easing, StyleSheet, Text } from 'react-native';

import { useReducedMotion } from '@/components/motion/useReducedMotion';
import { GlassSurface } from '@/components/ui/GlassSurface';
import { RegentPressable } from '@/components/ui/RegentPressable';
import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import { getMotionKnobs } from '@/utils/motionKnobs';
import type { ProgressToastState } from '@/utils/progressToast';

const { TEXT_PRIMARY, SUCCESS, BLUE } = COLORS;

type ProgressToastProps = {
  toast: ProgressToastState | null;
  onDismiss: () => void;
};

function ToastPill({ toast, onDismiss }: { toast: ProgressToastState; onDismiss: () => void }) {
  const reducedMotion = useReducedMotion();
  const entry = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;

  useEffect(() => {
    if (reducedMotion) {
      entry.setValue(1);
      return;
    }

    entry.setValue(0);
    Animated.timing(entry, {
      toValue: 1,
      // Frozen in release; live-tunable from the Motion Lab in debug.
      duration: getMotionKnobs().toastEntryMs,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [entry, reducedMotion]);

  // Cancellable auto-dismiss: unmounting or replacing the toast clears it.
  useEffect(() => {
    if (toast.dismissAtMs === null) {
      return;
    }

    const remainingMs = Math.max(0, toast.dismissAtMs - Date.now());
    const timer = setTimeout(onDismiss, remainingMs);
    return () => clearTimeout(timer);
  }, [onDismiss, toast.dismissAtMs]);

  const translateY = entry.interpolate({ inputRange: [0, 1], outputRange: [14, 0] });

  return (
    <Animated.View style={[styles.wrap, { opacity: entry, transform: [{ translateY }] }]}>
      <RegentPressable
        accessibilityRole="alert"
        accessibilityLabel={toast.label}
        onPress={onDismiss}
      >
        <GlassSurface level="pill" style={styles.pill}>
          {toast.phase === 'progress' ? (
            <ActivityIndicator size="small" color={BLUE} />
          ) : (
            <Ionicons name="checkmark-circle" size={20} color={SUCCESS} />
          )}
          <Text numberOfLines={2} style={styles.label}>
            {toast.label}
          </Text>
        </GlassSurface>
      </RegentPressable>
    </Animated.View>
  );
}

export function ProgressToast({ toast, onDismiss }: ProgressToastProps) {
  if (!toast) {
    return null;
  }

  // Keyed by id: a new toast re-runs the entry animation, a morph does not.
  return <ToastPill key={toast.id} toast={toast} onDismiss={onDismiss} />;
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 24,
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    maxWidth: '100%',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  label: {
    flexShrink: 1,
    color: TEXT_PRIMARY,
    fontSize: 14,
    lineHeight: 19,
    fontFamily: FONTS.body,
  },
});
