import { Pressable, StyleSheet, type PressableProps, type PressableStateCallbackType } from 'react-native';

import { useReducedMotion } from '@/components/motion/useReducedMotion';
import { runRegentHaptic, type RegentHapticKind } from '@/components/ui/haptics';

type RegentPressStyle = 'button' | 'card' | 'chip' | 'icon' | 'none';

type RegentPressableProps = Omit<PressableProps, 'style'> & {
  haptic?: RegentHapticKind;
  pressStyle?: RegentPressStyle;
  style?: PressableProps['style'];
};

function resolveStyle(style: PressableProps['style'], state: PressableStateCallbackType) {
  return typeof style === 'function' ? style(state) : style;
}

function getPressedStyle(pressStyle: RegentPressStyle, reducedMotionEnabled: boolean) {
  switch (pressStyle) {
    case 'card':
      return reducedMotionEnabled ? styles.cardPressedReduced : styles.cardPressed;
    case 'chip':
      return reducedMotionEnabled ? styles.chipPressedReduced : styles.chipPressed;
    case 'icon':
      return reducedMotionEnabled ? styles.iconPressedReduced : styles.iconPressed;
    case 'none':
      return null;
    case 'button':
    default:
      return reducedMotionEnabled ? styles.buttonPressedReduced : styles.buttonPressed;
  }
}

export function RegentPressable({
  disabled,
  haptic = 'tap',
  onPressIn,
  pressStyle = 'button',
  style,
  ...props
}: RegentPressableProps) {
  const reducedMotionEnabled = useReducedMotion();

  return (
    <Pressable
      {...props}
      disabled={disabled}
      onPressIn={(event) => {
        if (!disabled) {
          runRegentHaptic(haptic);
        }
        onPressIn?.(event);
      }}
      style={(state) => [resolveStyle(style, state), state.pressed && !disabled && getPressedStyle(pressStyle, reducedMotionEnabled)]}
    />
  );
}

const styles = StyleSheet.create({
  buttonPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
  buttonPressedReduced: {
    opacity: 0.92,
  },
  cardPressed: {
    opacity: 0.96,
    transform: [{ scale: 0.985 }],
  },
  cardPressedReduced: {
    opacity: 0.96,
  },
  chipPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  chipPressedReduced: {
    opacity: 0.9,
  },
  iconPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.96 }],
  },
  iconPressedReduced: {
    opacity: 0.9,
  },
});
