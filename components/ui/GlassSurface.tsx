/**
 * GlassSurface - the one surface view for floating chrome (toasts, sheets).
 *
 * Adapted from hermex AdaptiveGlassModifier.swift. Resolves its treatment
 * from the glass ladder: translucent tint normally, tinted opaque with a
 * contrast stroke when the person has Reduce Transparency on.
 */

import { useEffect, useState } from 'react';
import { AccessibilityInfo, View, type StyleProp, type ViewStyle } from 'react-native';

import { resolveGlassSurface, type GlassLevel } from '@/utils/glassSurface';

export function useReduceTransparency() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let isMounted = true;

    AccessibilityInfo.isReduceTransparencyEnabled().then((value) => {
      if (isMounted) {
        setEnabled(value);
      }
    });

    const subscription = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setEnabled);

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, []);

  return enabled;
}

type GlassSurfaceProps = {
  level?: GlassLevel;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

export function GlassSurface({ level = 'pill', style, children }: GlassSurfaceProps) {
  const reduceTransparency = useReduceTransparency();
  return <View style={[resolveGlassSurface(level, reduceTransparency), style]}>{children}</View>;
}
