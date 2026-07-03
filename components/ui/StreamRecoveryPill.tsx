/**
 * StreamRecoveryPill - visible "checking / reconnecting" status for a live
 * thread whose poll loop dropped.
 *
 * Adapted from hermex ChatStreamCoordinator.swift. Shows nothing while the
 * stream is live; a soft spinner pill while checking or reconnecting. Uses the
 * adaptive GlassSurface so it reads over the transcript.
 */

import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { GlassSurface } from '@/components/ui/GlassSurface';
import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import { streamRecoveryLabel, type StreamRecoveryState } from '@/utils/streamRecovery';

const { TEXT_SECONDARY, BLUE } = COLORS;

export function StreamRecoveryPill({ state }: { state: StreamRecoveryState }) {
  const label = streamRecoveryLabel(state);
  if (!label) {
    return null;
  }

  return (
    <View pointerEvents="none" style={styles.wrap}>
      <GlassSurface level="pill" style={styles.pill}>
        <ActivityIndicator size="small" color={BLUE} />
        <Text style={styles.label}>{label}</Text>
      </GlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
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
    color: TEXT_SECONDARY,
    fontSize: 13,
    fontFamily: FONTS.body,
  },
});
