import type { AnimateProps, SingleTransition, Transition, TransitionMap } from 'react-native-ease';

export type MotionVariant = 'screen' | 'card' | 'emphasis' | 'sheet';

export const MOTION_STAGGER_STEP = 48;

const MOTION_EASE_OUT: [number, number, number, number] = [0.2, 0.8, 0.2, 1];

function withDelay(transition: SingleTransition, delay: number): SingleTransition {
  if (delay <= 0 || transition.type === 'none') {
    return transition;
  }

  return {
    ...transition,
    delay,
  };
}

function withDelayMap(transition: TransitionMap, delay: number): TransitionMap {
  if (delay <= 0) {
    return transition;
  }

  return Object.fromEntries(
    Object.entries(transition).map(([key, value]) => [key, withDelay(value, delay)])
  ) as TransitionMap;
}

export function getEaseInitialAnimate(variant: MotionVariant): Partial<AnimateProps> {
  switch (variant) {
    case 'screen':
      return { opacity: 0, translateY: 12 };
    case 'emphasis':
      return { opacity: 0, translateY: 8, scale: 0.985 };
    case 'sheet':
      return { opacity: 0, translateY: 20 };
    case 'card':
    default:
      return { opacity: 0, translateY: 8 };
  }
}

export function getEaseAnimate(variant: MotionVariant): Partial<AnimateProps> {
  if (variant === 'emphasis') {
    return { opacity: 1, translateY: 0, scale: 1 };
  }

  return { opacity: 1, translateY: 0 };
}

export function getEaseTransition(
  variant: MotionVariant,
  reducedMotionEnabled: boolean,
  delay = 0
): Transition {
  if (reducedMotionEnabled) {
    return { type: 'none' };
  }

  switch (variant) {
    case 'sheet':
      return withDelayMap(
        {
          opacity: { type: 'timing', duration: 180, easing: 'easeOut' },
          transform: { type: 'spring', damping: 20, stiffness: 220, mass: 1 },
        },
        delay
      );
    case 'emphasis':
      return withDelayMap(
        {
          opacity: { type: 'timing', duration: 180, easing: 'easeOut' },
          transform: { type: 'timing', duration: 220, easing: MOTION_EASE_OUT },
          shadow: { type: 'timing', duration: 220, easing: 'easeOut' },
        },
        delay
      );
    case 'screen':
      return withDelayMap(
        {
          opacity: { type: 'timing', duration: 180, easing: 'easeOut' },
          transform: { type: 'timing', duration: 220, easing: MOTION_EASE_OUT },
        },
        delay
      );
    case 'card':
    default:
      return withDelayMap(
        {
          opacity: { type: 'timing', duration: 180, easing: 'easeOut' },
          transform: { type: 'timing', duration: 220, easing: MOTION_EASE_OUT },
        },
        delay
      );
  }
}
