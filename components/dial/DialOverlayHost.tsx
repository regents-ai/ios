import { useCallback, useMemo } from 'react';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RadialDial } from '@/components/dial/RadialDial';
import {
  resolveDialPetals,
  type DialPetalAction,
} from '@/components/dial/petalRegistry';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';

const TAB_BAR_CLEARANCE = 96;
const MESSAGE_COMPOSER_CLEARANCE = 92;
const EDGE_GUTTER = 16;

export function DialOverlayHost() {
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isMessageThread = /^\/message\/[^/]+\/?$/.test(pathname);
  const keyboardHeight = useKeyboardHeight(isMessageThread);
  const petals = useMemo(() => resolveDialPetals(pathname), [pathname]);
  const baseBottomOffset = Math.max(EDGE_GUTTER, insets.bottom) + TAB_BAR_CLEARANCE;
  const bottomOffset = isMessageThread
    ? Math.max(baseBottomOffset, keyboardHeight + MESSAGE_COMPOSER_CLEARANCE)
    : baseBottomOffset;
  const rightOffset = Math.max(EDGE_GUTTER, insets.right);

  const handleAction = useCallback(
    (action: DialPetalAction) => {
      if (action.kind === 'navigate') {
        router.push(action.href);
      }
    },
    [router]
  );

  if (petals.length === 0) {
    return null;
  }

  return (
    <RadialDial
      bottomOffset={bottomOffset}
      onAction={handleAction}
      petals={petals}
      rightOffset={rightOffset}
    />
  );
}
