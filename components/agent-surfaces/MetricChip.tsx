import { FONTS } from '@/constants/Typography';
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
      <Text style={[styles.metricValue, { color: accent }]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  metricChip: {
    flex: 1,
    minWidth: 96,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 4,
  },
  metricLabel: {
    color: '#6B7280',
    fontFamily: FONTS.body,
    fontSize: 12,
  },
  metricValue: {
    fontFamily: FONTS.heading,
    fontSize: 22,
  },
});
