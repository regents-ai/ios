/**
 * Adds USDC on Base to the phone wallet, the wallet that pays agent requests
 * and bids. Opened from "Add USDC to pay this" with the missing amount filled in.
 */

import { AddUsdc } from '@/components/onramp/AddUsdc';
import { RegentPressable } from '@/components/ui/RegentPressable';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { useCurrentUser } from '@coinbase/cdp-hooks';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function AddUsdcScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ amount?: string }>();
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { currentUser } = useCurrentUser();
  const phoneWallet = currentUser?.evmSmartAccounts?.[0] as string | undefined;
  const [isSwipeActive, setIsSwipeActive] = useState(false);

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <View style={styles.header}>
        <RegentPressable
          accessibilityLabel="Go back"
          accessibilityRole="button"
          pressStyle="icon"
          onPress={() => router.back()}
          style={styles.iconButton}
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </RegentPressable>
        <Text style={styles.headerTitle} numberOfLines={1}>Add USDC</Text>
        <View style={styles.iconSpacer} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardWrap}>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          scrollEnabled={!isSwipeActive}
        >
          <Text style={styles.intro}>
            USDC goes to your phone wallet, which pays agent requests and bids.
          </Text>
          {phoneWallet ? (
            <AddUsdc
              destinationAddress={phoneWallet}
              destinationLabel="your phone wallet"
              initialAmount={typeof params.amount === 'string' ? params.amount : ''}
              onSwipeActiveChange={setIsSwipeActive}
            />
          ) : (
            <Text style={styles.intro}>Your wallet is still getting ready. Try again in a moment.</Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeStyles({ colors, fonts }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    keyboardWrap: {
      flex: 1,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 8,
      gap: 12,
    },
    iconButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.hairlineStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconSpacer: {
      width: 44,
      height: 44,
    },
    headerTitle: {
      flex: 1,
      minWidth: 0,
      color: colors.text,
      fontSize: 20,
      lineHeight: 24,
      textAlign: 'center',
      fontFamily: fonts.title,
    },
    intro: {
      marginHorizontal: 16,
      marginTop: 8,
      color: colors.textMuted,
      fontSize: 14,
      lineHeight: 20,
      fontFamily: fonts.ui,
    },
  });
}
