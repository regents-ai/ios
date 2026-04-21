import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';

const { BORDER, CARD_BG, DANGER, TEXT_PRIMARY, TEXT_SECONDARY } = COLORS;

type Props = {
  message: string;
  onRetry: () => void;
};

export function WalletOptionsError({ message, onRetry }: Props) {
  return (
    <View style={styles.errorBanner}>
      <View style={styles.copy}>
        <Text style={styles.errorTitle}>Failed to load payment options</Text>
        <Text style={styles.errorMessage}>{message}</Text>
      </View>
      <Pressable onPress={onRetry} style={({ pressed }) => [styles.retryButton, pressed && styles.retryPressed]}>
        <Text style={styles.retryText}>Retry</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  errorBanner: {
    margin: 16,
    marginBottom: 0,
    backgroundColor: CARD_BG,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  errorTitle: {
    color: TEXT_PRIMARY,
    fontSize: 15,
    fontFamily: FONTS.heading,
  },
  errorMessage: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FONTS.body,
  },
  retryButton: {
    backgroundColor: DANGER,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  retryPressed: {
    opacity: 0.85,
  },
  retryText: {
    color: '#fff',
    fontSize: 13,
    fontFamily: FONTS.body,
  },
});
