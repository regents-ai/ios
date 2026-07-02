import { type ReactNode } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import { EaseView } from 'react-native-ease';

import {
  getEaseAnimate,
  getEaseInitialAnimate,
  getEaseTransition,
  type MotionVariant,
} from '@/components/motion/easePresets';
import { useReducedMotion } from '@/components/motion/useReducedMotion';

const VERIFICATION_STAGGER_STEP = 50;

type VerificationMotionProps = {
  children: ReactNode;
  order?: number;
  style?: StyleProp<ViewStyle>;
  variant?: MotionVariant;
};

export function VerificationMotion({
  children,
  order = 0,
  style,
  variant = 'card',
}: VerificationMotionProps) {
  const reducedMotionEnabled = useReducedMotion();

  return (
    <EaseView
      initialAnimate={getEaseInitialAnimate(variant)}
      animate={getEaseAnimate(variant)}
      transition={getEaseTransition(variant, reducedMotionEnabled, order * VERIFICATION_STAGGER_STEP)}
      style={style}
    >
      {children}
    </EaseView>
  );
}
