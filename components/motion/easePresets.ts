import type { AnimateProps, SingleTransition, Transition, TransitionMap } from 'react-native-ease';

/**
 * Every motion preset in this module is produced by a function of the current
 * reduced-motion state, so call sites cannot forget to combine them:
 *
 * - `getMotionPreset` returns the complete entrance preset (initial pose,
 *   resting pose, and transition) for one-shot entrances. Under reduced
 *   motion the initial pose equals the resting pose and the transition is
 *   `none`, so the view simply appears in place.
 * - `getEaseTransition` returns the transition piece alone for surfaces that
 *   animate between visible states with their own animate values (modals,
 *   sheets, backdrops). Under reduced motion it returns `none`, so values
 *   apply instantly.
 */
export type MotionVariant = 'screen' | 'card' | 'emphasis' | 'sheet';

export type MotionPreset = {
  animate: Partial<AnimateProps>;
  initialAnimate: Partial<AnimateProps>;
  transition: Transition;
};

export const MOTION_STAGGER_STEP = 48;

const MOTION_EASE_OUT: [number, number, number, number] = [0.2, 0.8, 0.2, 1];

const NO_TRANSITION: Transition = { type: 'none' };

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

function getEntrancePose(variant: MotionVariant): Partial<AnimateProps> {
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

function getRestingPose(variant: MotionVariant): Partial<AnimateProps> {
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
    return NO_TRANSITION;
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

export function getMotionPreset(
  variant: MotionVariant,
  reducedMotionEnabled: boolean,
  delay = 0
): MotionPreset {
  const animate = getRestingPose(variant);

  if (reducedMotionEnabled) {
    return {
      animate,
      initialAnimate: animate,
      transition: NO_TRANSITION,
    };
  }

  return {
    animate,
    initialAnimate: getEntrancePose(variant),
    transition: getEaseTransition(variant, false, delay),
  };
}
