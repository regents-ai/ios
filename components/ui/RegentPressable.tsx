import {
  Pressable,
  StyleSheet,
  type PressableProps,
  type PressableStateCallbackType,
  type ViewStyle,
} from 'react-native';

import { useReducedMotion } from '@/components/motion/useReducedMotion';
import { runRegentHaptic, type RegentHapticKind } from '@/components/ui/haptics';

type RegentPressStyle = 'button' | 'card' | 'chip' | 'icon' | 'none';

/** Surface classes with tuned pressed scale/opacity specs. */
export type RegentPressVariant = 'icon' | 'capsule' | 'card' | 'thumbnail';

type PressSpec = {
  opacity: number;
  scale: number;
};

const PRESS_VARIANT_SPECS: Record<RegentPressVariant, PressSpec> = {
  icon: { opacity: 0.9, scale: 0.945 },
  capsule: { opacity: 0.92, scale: 0.975 },
  card: { opacity: 0.96, scale: 0.985 },
  thumbnail: { opacity: 0.94, scale: 0.98 },
};

type VariantPressedStyles = {
  full: ViewStyle;
  reduced: ViewStyle;
};

function buildPressedStyles(spec: PressSpec): VariantPressedStyles {
  return {
    full: { opacity: spec.opacity, transform: [{ scale: spec.scale }] },
    reduced: { opacity: spec.opacity },
  };
}

const VARIANT_PRESSED_STYLES: Record<RegentPressVariant, VariantPressedStyles> = {
  icon: buildPressedStyles(PRESS_VARIANT_SPECS.icon),
  capsule: buildPressedStyles(PRESS_VARIANT_SPECS.capsule),
  card: buildPressedStyles(PRESS_VARIANT_SPECS.card),
  thumbnail: buildPressedStyles(PRESS_VARIANT_SPECS.thumbnail),
};

type RegentPressableProps = Omit<PressableProps, 'style'> & {
  /**
   * Collapses the surface shadow slightly while pressed. Only meaningful for
   * surfaces that render an iOS shadow (or Android elevation).
   */
  collapseShadowOnPress?: boolean;
  haptic?: RegentHapticKind;
  pressStyle?: RegentPressStyle;
  style?: PressableProps['style'];
  /**
   * Opts into the per-surface press spec table. When omitted, the legacy
   * `pressStyle` treatment applies unchanged (default `button`).
   */
  variant?: RegentPressVariant;
};

function resolveStyle(style: PressableProps['style'], state: PressableStateCallbackType) {
  return typeof style === 'function' ? style(state) : style;
}

function getVariantPressedStyle(variant: RegentPressVariant, reducedMotionEnabled: boolean) {
  const pressedStyles = VARIANT_PRESSED_STYLES[variant];
  return reducedMotionEnabled ? pressedStyles.reduced : pressedStyles.full;
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
  collapseShadowOnPress = false,
  disabled,
  haptic = 'tap',
  onPressIn,
  pressStyle = 'button',
  style,
  variant,
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
      style={(state) => [
        resolveStyle(style, state),
        state.pressed &&
          !disabled &&
          (variant
            ? getVariantPressedStyle(variant, reducedMotionEnabled)
            : getPressedStyle(pressStyle, reducedMotionEnabled)),
        state.pressed && !disabled && collapseShadowOnPress && styles.shadowCollapsed,
      ]}
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
  shadowCollapsed: {
    elevation: 1,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
});
