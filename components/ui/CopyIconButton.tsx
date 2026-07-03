/**
 * Copy button whose icon morphs copy → checkmark on press.
 *
 * The two icons cross-fade and scale between each other, then revert after a
 * short hold. The morph resets to the copy icon the moment the `value` prop
 * changes, so the button never shows a stale "Copied" state for new content.
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { useReducedMotion } from '@/components/motion/useReducedMotion';
import { runRegentHaptic } from '@/components/ui/haptics';
import { RegentPressable } from '@/components/ui/RegentPressable';
import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';

const { BORDER, SUCCESS, TEXT_PRIMARY, WHITE } = COLORS;
const GREEN_WASH = '#E6F0EA';
const COPIED_HOLD_MS = 1400;
const MORPH_DURATION_MS = 160;
const ICON_SIZE = 15;

export function CopyIconButton({
  value,
  contentLabel,
  onCopyError,
}: {
  /** The content to copy. Changing it resets the button to its copy state. */
  value: string;
  /** Plain-language name of the content, used for the accessibility label. */
  contentLabel: string;
  onCopyError?: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const [copied, setCopied] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const revertTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const animateTo = (toValue: 0 | 1) => {
    progress.stopAnimation();
    if (reduceMotion) {
      progress.setValue(toValue);
      return;
    }

    Animated.timing(progress, {
      toValue,
      duration: MORPH_DURATION_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };

  const clearRevertTimer = () => {
    if (revertTimer.current) {
      clearTimeout(revertTimer.current);
      revertTimer.current = null;
    }
  };

  // Reset whenever the underlying content changes so a "Copied" state never
  // lingers over a new value.
  useEffect(() => {
    if (revertTimer.current) {
      clearTimeout(revertTimer.current);
      revertTimer.current = null;
    }
    progress.stopAnimation();
    progress.setValue(0);
    setCopied(false);
  }, [value, progress]);

  useEffect(() => {
    return () => {
      if (revertTimer.current) {
        clearTimeout(revertTimer.current);
      }
    };
  }, []);

  const handleCopy = async () => {
    try {
      await Clipboard.setStringAsync(value);
    } catch {
      onCopyError?.();
      return;
    }

    runRegentHaptic('copy');
    setCopied(true);
    animateTo(1);

    clearRevertTimer();
    revertTimer.current = setTimeout(() => {
      revertTimer.current = null;
      setCopied(false);
      animateTo(0);
    }, COPIED_HOLD_MS);
  };

  return (
    <RegentPressable
      haptic="none"
      pressStyle="chip"
      style={[styles.button, copied && styles.buttonCopied]}
      onPress={handleCopy}
      accessibilityRole="button"
      accessibilityLabel={copied ? `Copied ${contentLabel}` : `Copy ${contentLabel}`}
      accessibilityHint="Copies it so you can paste it somewhere else"
    >
      <View style={styles.content}>
        <View style={styles.iconSlot}>
          <Animated.View
            style={[
              styles.iconLayer,
              {
                opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
                transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.5] }) }],
              },
            ]}
          >
            <Ionicons name="copy-outline" size={ICON_SIZE} color={TEXT_PRIMARY} />
          </Animated.View>
          <Animated.View
            style={[
              styles.iconLayer,
              {
                opacity: progress,
                transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }],
              },
            ]}
          >
            <Ionicons name="checkmark-circle" size={ICON_SIZE} color={SUCCESS} />
          </Animated.View>
        </View>
        <Text style={[styles.label, copied && styles.labelCopied]}>{copied ? 'Copied' : 'Copy address'}</Text>
      </View>
    </RegentPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
  },
  buttonCopied: {
    backgroundColor: GREEN_WASH,
    borderColor: SUCCESS,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minWidth: 0,
  },
  iconSlot: {
    width: ICON_SIZE + 2,
    height: ICON_SIZE + 2,
  },
  iconLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: TEXT_PRIMARY,
    fontSize: 13,
    fontFamily: FONTS.body,
  },
  labelCopied: {
    color: SUCCESS,
  },
});
