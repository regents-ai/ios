import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { routes } from '@/utils/navigation/routes';

export default function OnrampReturnScreen() {
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const params = useLocalSearchParams<{ partnerUserRef?: string }>();
  const hasReference = typeof params.partnerUserRef === 'string' && params.partnerUserRef.length > 0;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name="checkmark" size={28} color={colors.onAccent} />
          </View>
          <Text style={styles.title}>Purchase received</Text>
          <Text style={styles.body}>
            Coinbase is checking the purchase now. Your wallet will update after the purchase finishes.
          </Text>
          {hasReference ? (
            <View style={styles.referenceBox}>
              <Text style={styles.referenceLabel}>Reference</Text>
              <Text style={styles.referenceText}>{params.partnerUserRef}</Text>
            </View>
          ) : null}
          <Pressable style={styles.primaryButton} onPress={() => router.replace(routes.wallet())}>
            <Ionicons name="wallet-outline" size={18} color={colors.onAccent} />
            <Text style={styles.primaryButtonText}>Back to Wallet</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

function makeStyles({ colors, fonts }: Theme) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    borderRadius: 24,
    padding: 22,
    gap: 16,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: colors.text,
    fontSize: 30,
    lineHeight: 34,
    fontFamily: fonts.title,
  },
  body: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: fonts.ui,
  },
  referenceBox: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },
  referenceLabel: {
    color: colors.textMuted,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontFamily: fonts.ui,
  },
  referenceText: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.ui,
  },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryButtonText: {
    color: colors.onAccent,
    fontSize: 15,
    fontFamily: fonts.ui,
  },
  });
}
