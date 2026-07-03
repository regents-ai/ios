import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { RegentPressable } from '@/components/ui/RegentPressable';
import { useTheme, type Theme } from '@/theme/ThemeProvider';

type Props = {
  message: string;
  onRetry: () => void;
};

export function WalletOptionsError({ message, onRetry }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.errorBanner}>
      <View style={styles.copy}>
        <Text style={styles.errorTitle}>Adding cash is not ready</Text>
        <Text style={styles.errorMessage}>{message}</Text>
      </View>
      <RegentPressable onPress={onRetry} style={styles.retryButton}>
        <Text style={styles.retryText}>Retry</Text>
      </RegentPressable>
    </View>
  );
}

function makeStyles({ colors, fonts }: Theme) {
  return StyleSheet.create({
    errorBanner: {
      margin: 16,
      marginBottom: 0,
      backgroundColor: colors.surfaceElevated,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.hairlineStrong,
      padding: 16,
      gap: 14,
    },
    copy: {
      gap: 4,
    },
    errorTitle: {
      color: colors.text,
      fontSize: 15,
      fontFamily: fonts.title,
    },
    errorMessage: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 18,
      fontFamily: fonts.ui,
    },
    retryButton: {
      backgroundColor: colors.error,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 12,
      alignItems: 'center',
      width: '100%',
    },
    retryText: {
      color: '#fff',
      fontSize: 13,
      fontFamily: fonts.ui,
    },
  });
}
