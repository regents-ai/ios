import { FONTS } from '@/constants/Typography';
import { LiveValueFlash } from '@/components/motion/LiveValueFlash';
import { StyleSheet, Text, View } from 'react-native';

export function MetricChip({
  accent,
  label,
  value,
}: {
  accent: string;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.metricChip}>
      <LiveValueFlash value={`${label}-${value}`} nudge style={styles.metricValueFlash}>
        <Text style={[styles.metricValue, { color: accent }]}>{value}</Text>
      </LiveValueFlash>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  metricChip: {
    flex: 1,
    minWidth: 96,
    maxWidth: '100%',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D7C7A1',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 3,
  },
  metricValueFlash: {
    alignSelf: 'flex-start',
  },
  metricLabel: {
    color: '#6B7280',
    fontFamily: FONTS.body,
    fontSize: 12,
    lineHeight: 16,
  },
  metricValue: {
    fontFamily: FONTS.heading,
    fontSize: 22,
    lineHeight: 24,
  },
});
