import { type ReactNode } from 'react';
import { EaseView } from 'react-native-ease';
import type { StyleProp, ViewStyle } from 'react-native';

import { MotionVariant, getEaseAnimate, getEaseInitialAnimate, getEaseTransition } from './easePresets';
import { useStaggerGroup } from './StaggerGroup';

type StaggerItemProps = {
  children: ReactNode;
  order?: number;
  style?: StyleProp<ViewStyle>;
  variant?: MotionVariant;
};

export function StaggerItem({
  children,
  order = 0,
  style,
  variant = 'card',
}: StaggerItemProps) {
  const { reducedMotionEnabled, step } = useStaggerGroup();
  const delay = order * step;

  return (
    <EaseView
      initialAnimate={getEaseInitialAnimate(variant)}
      animate={getEaseAnimate(variant)}
      transition={getEaseTransition(variant, reducedMotionEnabled, delay)}
      style={style}
    >
      {children}
    </EaseView>
  );
}
