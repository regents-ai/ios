import { useMemo } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { RegentPressable } from '@/components/ui/RegentPressable';
import { useTheme, type Theme } from '@/theme/ThemeProvider';

/** Shown in place of the Regents Balance until the person signs in on regents.sh with a wallet. */
export function RegentsBalanceSetup() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <View style={styles.container}>
      <Text style={styles.message}>Sign in on regents.sh with a wallet to set up your Regents Balance.</Text>
      <RegentPressable
        accessibilityHint="Opens in your browser"
        accessibilityRole="link"
        style={styles.button}
        onPress={() => void Linking.openURL('https://regents.sh')}
      >
        <Text style={styles.buttonText}>Open regents.sh</Text>
      </RegentPressable>
    </View>
  );
}

function makeStyles({ colors, fonts }: Theme) {
  return StyleSheet.create({
    container: {
      gap: 12,
    },
    message: {
      color: colors.textMuted,
      fontSize: 14,
      lineHeight: 20,
      fontFamily: fonts.ui,
    },
    button: {
      alignSelf: 'flex-start',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 44,
      paddingHorizontal: 16,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.hairlineStrong,
      backgroundColor: colors.surface,
    },
    buttonText: {
      color: colors.accent,
      fontSize: 14,
      fontFamily: fonts.ui,
    },
  });
}
