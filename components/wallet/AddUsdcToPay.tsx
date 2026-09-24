import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { RegentPressable } from '@/components/ui/RegentPressable';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { formatUsdcBalance } from '@/utils/agents/kinds';
import { routes } from '@/utils/navigation/routes';
import { usdcTopUp } from '@/utils/onchain/baseUsdc';

/**
 * Offers to buy the USDC the phone wallet is missing for a payment. Shows
 * nothing when the wallet already holds `needed`.
 */
export function AddUsdcToPay({ held, needed }: { held: string; needed: string }) {
  const router = useRouter();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const topUp = usdcTopUp(needed, held);

  if (!topUp) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.message}>
        Your phone wallet holds {formatUsdcBalance(held)}. This needs {formatUsdcBalance(needed)}.
      </Text>
      <RegentPressable style={styles.button} onPress={() => router.push(routes.addUsdc(topUp))}>
        <Text style={styles.buttonText}>Add USDC to pay this</Text>
      </RegentPressable>
    </View>
  );
}

function makeStyles({ colors, fonts }: Theme) {
  return StyleSheet.create({
    container: {
      gap: 10,
      padding: 14,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.hairlineStrong,
      backgroundColor: colors.accentWash,
    },
    message: {
      color: colors.text,
      fontSize: 14,
      lineHeight: 20,
      fontFamily: fonts.ui,
    },
    button: {
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 46,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.accent,
      backgroundColor: colors.surface,
    },
    buttonText: {
      color: colors.accent,
      fontSize: 15,
      fontFamily: fonts.ui,
    },
  });
}
