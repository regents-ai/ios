import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DIAL_CENTER_SIZE } from '@/utils/dialConstants';

export const TAB_BAR_CLEARANCE = 96;
export const EDGE_GUTTER = 16;

/**
 * Bottom padding for scrolling content so the last row can scroll clear of
 * the floating dial: the dial's bottom offset plus its size and a gutter.
 */
export function useDialContentClearance() {
  const insets = useSafeAreaInsets();
  return Math.max(EDGE_GUTTER, insets.bottom) + TAB_BAR_CLEARANCE + DIAL_CENTER_SIZE + EDGE_GUTTER;
}
