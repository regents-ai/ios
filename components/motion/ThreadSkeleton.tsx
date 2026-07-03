import { StyleSheet, View } from 'react-native';

import { ShimmerBlock } from '@/components/motion/ShimmerBlock';
import { COLORS } from '@/constants/Colors';

const { CARD_BG, CARD_ALT, BORDER, SURFACE_STRONG } = COLORS;

type SkeletonRowProps = {
  fromUser?: boolean;
};

function SkeletonRow({ fromUser = false }: SkeletonRowProps) {
  return (
    <View style={[styles.card, fromUser && styles.userCard]}>
      <View style={styles.cardHeader}>
        <ShimmerBlock style={[styles.line, styles.titleLine]} />
        <ShimmerBlock style={[styles.line, styles.timeLine]} />
      </View>
      <ShimmerBlock style={[styles.line, styles.bodyLine]} />
      {fromUser ? null : <ShimmerBlock style={[styles.line, styles.bodyLineShort]} />}
    </View>
  );
}

/**
 * Content-shaped loading placeholder for a message thread: alternating
 * message-row placeholders that shimmer while the conversation loads.
 * Exposed to assistive tech as a single, non-interactive element.
 */
export function ThreadSkeleton() {
  return (
    <View
      accessible
      accessibilityLabel="Loading messages"
      importantForAccessibility="yes"
      pointerEvents="none"
      style={styles.container}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.rows}
      >
        <SkeletonRow />
        <SkeletonRow fromUser />
        <SkeletonRow />
        <SkeletonRow fromUser />
        <SkeletonRow />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 14,
  },
  rows: {
    gap: 10,
  },
  card: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 18,
    padding: 14,
    gap: 10,
  },
  userCard: {
    backgroundColor: CARD_ALT,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  line: {
    borderRadius: 999,
    backgroundColor: SURFACE_STRONG,
  },
  titleLine: {
    width: '34%',
    height: 12,
  },
  timeLine: {
    width: 40,
    height: 10,
  },
  bodyLine: {
    width: '100%',
    height: 12,
  },
  bodyLineShort: {
    width: '68%',
    height: 12,
  },
});
