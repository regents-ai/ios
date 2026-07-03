/**
 * StreamRecoveryPill - visible "checking / reconnecting" status for a live
 * thread whose poll loop dropped.
 *
 * Adapted from hermex ChatStreamCoordinator.swift. Shows nothing while the
 * stream is live; a soft spinner pill while checking or reconnecting. Uses the
 * adaptive GlassSurface so it reads over the transcript.
 */

import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { GlassSurface } from '@/components/ui/GlassSurface';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { streamRecoveryLabel, type StreamRecoveryState } from '@/utils/streamRecovery';

export function StreamRecoveryPill({ state }: { state: StreamRecoveryState }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const label = streamRecoveryLabel(state);
  if (!label) {
    return null;
  }

  return (
    <View pointerEvents="none" style={styles.wrap}>
      <GlassSurface level="pill" style={styles.pill}>
        <ActivityIndicator size="small" color={theme.colors.accent} />
        <Text style={styles.label}>{label}</Text>
      </GlassSurface>
    </View>
  );
}

function makeStyles({ colors, fonts, type }: Theme) {
  return StyleSheet.create({
    wrap: {
      position: 'absolute',
      top: 10,
      left: 0,
      right: 0,
      alignItems: 'center',
    },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    label: {
      color: colors.textMuted,
      fontSize: type.caption.size,
      fontFamily: fonts.ui,
    },
  });
}
