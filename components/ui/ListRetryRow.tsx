/**
 * Contextual retry row for list error states.
 *
 * Shows connectivity-aware copy (title/message decided by the caller via
 * utils/listLoadFailure) with a retry control that always meets the 44pt
 * minimum touch target.
 */

import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { RegentPressable } from '@/components/ui/RegentPressable';
import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';

const { BLUE, DANGER, TEXT_SECONDARY, WHITE } = COLORS;

export function ListRetryRow({
  title,
  message,
  offline,
  onRetry,
  retryHint,
}: {
  title: string;
  message: string;
  offline: boolean;
  onRetry: () => void;
  retryHint: string;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.copyRow}>
        <Ionicons
          name={offline ? 'cloud-offline-outline' : 'warning-outline'}
          size={20}
          color={DANGER}
        />
        <View style={styles.copy}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message} selectable>
            {message}
          </Text>
        </View>
      </View>
      <RegentPressable
        style={styles.retryButton}
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel="Retry"
        accessibilityHint={retryHint}
      >
        <Text style={styles.retryText}>Retry</Text>
      </RegentPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: DANGER,
    backgroundColor: '#FFF0F0',
    padding: 14,
    gap: 12,
  },
  copyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  title: {
    color: DANGER,
    fontSize: 15,
    lineHeight: 20,
    fontFamily: FONTS.heading,
  },
  message: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FONTS.body,
  },
  retryButton: {
    alignSelf: 'flex-start',
    minHeight: 44,
    minWidth: 88,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    color: WHITE,
    fontSize: 14,
    fontFamily: FONTS.body,
  },
});
