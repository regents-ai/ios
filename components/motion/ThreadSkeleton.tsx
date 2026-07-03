import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { ShimmerBlock } from '@/components/motion/ShimmerBlock';
import { useTheme, type Theme } from '@/theme/ThemeProvider';

type SkeletonRowProps = {
  fromUser?: boolean;
  styles: ReturnType<typeof makeStyles>;
};

function SkeletonRow({ fromUser = false, styles }: SkeletonRowProps) {
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
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
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
        <SkeletonRow styles={styles} />
        <SkeletonRow styles={styles} fromUser />
        <SkeletonRow styles={styles} />
        <SkeletonRow styles={styles} fromUser />
        <SkeletonRow styles={styles} />
      </View>
    </View>
  );
}

function makeStyles({ colors }: Theme) {
  return StyleSheet.create({
    container: {
      marginBottom: 14,
    },
    rows: {
      gap: 10,
    },
    card: {
      backgroundColor: colors.surfaceElevated,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.hairlineStrong,
      borderRadius: 18,
      padding: 14,
      gap: 10,
    },
    userCard: {
      backgroundColor: colors.surface,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    line: {
      borderRadius: 999,
      backgroundColor: colors.border,
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
}
