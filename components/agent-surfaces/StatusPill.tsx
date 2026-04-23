import { FONTS } from '@/constants/Typography';
import { StyleSheet, Text, View } from 'react-native';

type StatusPillProps = {
  label: string;
  color: string;
  backgroundColor: string;
  borderColor?: string;
  showDot?: boolean;
  compact?: boolean;
};

export function StatusPill({ label, color, backgroundColor, borderColor, showDot = false, compact = false }: StatusPillProps) {
  return (
    <View
      style={[
        styles.pill,
        compact && styles.compactPill,
        {
          backgroundColor,
          borderColor: borderColor ?? backgroundColor,
        },
      ]}
    >
      {showDot ? <View style={[styles.dot, { backgroundColor: color }]} /> : null}
      <Text style={[styles.label, compact && styles.compactLabel, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  compactPill: {
    paddingVertical: 5,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    fontSize: 12,
    fontFamily: FONTS.body,
  },
  compactLabel: {
    fontSize: 11,
  },
});
