import { useCallback, useMemo } from 'react';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EDGE_GUTTER, TAB_BAR_CLEARANCE } from '@/components/dial/dialLayout';
import { RadialDial } from '@/components/dial/RadialDial';
import { resolveDialPetals, type DialPetalAction } from '@/components/dial/petalRegistry';

export function DialOverlayHost() {
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const petals = useMemo(() => resolveDialPetals(pathname), [pathname]);
  const bottomOffset = Math.max(EDGE_GUTTER, insets.bottom) + TAB_BAR_CLEARANCE;
  const rightOffset = Math.max(EDGE_GUTTER, insets.right);

  const handleAction = useCallback(
    (action: DialPetalAction) => {
      router.push(action.href);
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
