import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AgentFundHero } from '@/components/agents/AgentFundHero';
import { useDialContentClearance } from '@/components/dial/dialLayout';
import { LiveValueFlash } from '@/components/motion/LiveValueFlash';
import { StaggerGroup } from '@/components/motion/StaggerGroup';
import { StaggerItem } from '@/components/motion/StaggerItem';
import { AddUsdc } from '@/components/onramp/AddUsdc';
import { RegentPressable } from '@/components/ui/RegentPressable';
import { WalletScreenHeader } from '@/components/wallet/home/wallet-screen-header';
import { RegentsBalanceSetup } from '@/components/wallet/RegentsBalanceSetup';
import { WalletDetailsSection } from '@/components/wallet/WalletDetailsSection';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { useRegentsBalanceWallet } from '@/hooks/useRegentsBalanceWallet';
import { useWalletDetailsState } from '@/hooks/wallet/useWalletDetailsState';
import { routes } from '@/utils/navigation/routes';


function formatAddress(address: string) {
  if (address.length <= 16) return address;
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

export default function WalletScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const dialClearance = useDialContentClearance();
  const [isSwipeActive, setIsSwipeActive] = useState(false);

  const regentsBalanceWallet = useRegentsBalanceWallet();
  const walletDetails = useWalletDetailsState();
  const refreshingWallet = walletDetails.loadingBalances;

  const quickActions = [
    {
      label: 'Pay',
      detail: 'Pay an agent or another wallet',
      icon: 'arrow-up-outline',
      onPress: () => router.push(routes.pay()),
    },
    {
      label: 'Rewards',
      detail: 'Track REGENT and claim rewards',
      icon: 'sparkles-outline',
      onPress: () => router.push(routes.earn()),
    },
    {
      label: 'Settings',
      detail: 'Update wallet and account details',
      icon: 'settings-outline',
      onPress: () => router.push('/settings'),
    },
    {
      label: 'Support',
      detail: 'Get help and common answers',
      icon: 'help-circle-outline',
      onPress: () => router.push('/support'),
    },
  ] as const;

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <WalletScreenHeader />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardWrap}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: dialClearance }}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          removeClippedSubviews={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshingWallet}
              onRefresh={() => void walletDetails.refreshWalletSnapshot()}
              tintColor={colors.accent}
            />
          }
          scrollEnabled={!isSwipeActive}
        >
          <View style={styles.hero}>
            <AgentFundHero />
          </View>

          <StaggerGroup>
            <StaggerItem order={0}>
              <View style={styles.summaryCard}>
                <View style={styles.summaryTopRow}>
                  <View style={styles.summaryCopy}>
                    <Text style={styles.summaryEyebrow}>Regents Balance</Text>
                    <Text style={styles.summaryTitle}>Add to your Regents Balance.</Text>
                    <Text style={styles.summaryBody}>
                      Buy USDC on Base with Apple Pay or a card. It goes to the wallet you sign in with on regents.sh.
                    </Text>
                  </View>
                  <View style={styles.statusPill}>
                    <View style={[styles.statusDot, !regentsBalanceWallet && styles.statusDotIdle]} />
                    <Text style={styles.statusText}>{regentsBalanceWallet ? 'Ready' : 'Set up'}</Text>
                  </View>
                </View>

                <View style={styles.summaryStats}>
                  <View style={styles.summaryStat}>
                    <Text style={styles.summaryStatLabel}>You add</Text>
                    <Text style={styles.summaryStatValue}>USDC on Base</Text>
                  </View>
                  <View style={styles.summaryStat}>
                    <Text style={styles.summaryStatLabel}>It goes to</Text>
                    <LiveValueFlash value={regentsBalanceWallet ? formatAddress(regentsBalanceWallet) : 'regents-balance-setup'}>
                      <Text style={styles.summaryStatValue}>
                        {regentsBalanceWallet ? formatAddress(regentsBalanceWallet) : 'Sign in on regents.sh with a wallet'}
                      </Text>
                    </LiveValueFlash>
                  </View>
                </View>
              </View>
            </StaggerItem>

            <StaggerItem order={1}>
              <View style={styles.quickActionList}>
                {quickActions.map((action) => (
                  <RegentPressable
                    key={action.label}
                    pressStyle="card"
                    style={styles.quickActionCard}
                    onPress={action.onPress}
                  >
                    <View style={styles.quickActionRow}>
                      <View style={styles.quickActionIcon}>
                        <Ionicons name={action.icon} size={20} color={colors.accent} />
                      </View>
                      <View style={styles.quickActionCopy}>
                        <Text style={styles.quickActionLabel}>{action.label}</Text>
                        <Text style={styles.quickActionDetail}>{action.detail}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                    </View>
                  </RegentPressable>
                ))}
              </View>
            </StaggerItem>

            <StaggerItem order={2}>
              <View style={styles.sectionIntro}>
                <Text style={styles.sectionTitle}>Add to your Regents Balance</Text>
                {regentsBalanceWallet ? (
                  <Text style={styles.sectionBody}>
                    Pick an amount, choose Apple Pay when available, and review before USDC is added.
                  </Text>
                ) : null}
              </View>
            </StaggerItem>

            <StaggerItem order={3}>
              {regentsBalanceWallet ? (
                <AddUsdc
                  amountUnit="payment"
                  destinationAddress={regentsBalanceWallet}
                  destinationLabel="your Regents Balance"
                  onSwipeActiveChange={setIsSwipeActive}
                />
              ) : (
                <View style={styles.setupCard}>
                  <RegentsBalanceSetup />
                </View>
              )}
            </StaggerItem>

            <StaggerItem order={4}>
              <View style={styles.sectionIntro}>
                <Text style={styles.sectionTitle}>Phone wallet</Text>
                <Text style={styles.sectionBody}>
                  Your phone wallet pays agent requests and bids. Send USDC from it to your Regents Balance any time.
                </Text>
              </View>
            </StaggerItem>

            <StaggerItem order={5}>
              <WalletDetailsSection walletDetails={walletDetails} />
            </StaggerItem>
          </StaggerGroup>
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
  hero: {
    marginTop: 16,
  },
  summaryCard: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 20,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    gap: 18,
  },
  summaryTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
  },
  summaryCopy: {
    flex: 1,
    minWidth: 0,
    gap: 8,
  },
  summaryEyebrow: {
    color: colors.accent,
    fontSize: 12,
    fontFamily: fonts.title,
  },
  summaryTitle: {
    color: colors.text,
    fontSize: 28,
    lineHeight: 31,
    fontFamily: fonts.title,
  },
  summaryBody: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: fonts.ui,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.success,
  },
  statusDotIdle: {
    backgroundColor: colors.border,
  },
  statusText: {
    color: colors.text,
    fontSize: 11,
    fontFamily: fonts.ui,
  },
  summaryStats: {
    gap: 10,
  },
  summaryStat: {
    padding: 14,
    borderRadius: 18,
    backgroundColor: colors.surface,
    gap: 4,
  },
  summaryStatLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontFamily: fonts.ui,
  },
  summaryStatValue: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 20,
    fontFamily: fonts.title,
  },
  quickActionList: {
    marginHorizontal: 16,
    gap: 12,
  },
  quickActionCard: {
    padding: 16,
    borderRadius: 22,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    minHeight: 84,
    alignSelf: 'stretch',
  },
  quickActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  quickActionIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  quickActionLabel: {
    color: colors.text,
    fontSize: 16,
    fontFamily: fonts.title,
  },
  quickActionDetail: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: fonts.ui,
  },
  setupCard: {
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 20,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
  },
  sectionIntro: {
    marginHorizontal: 16,
    marginTop: 4,
    gap: 4,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 22,
    fontFamily: fonts.title,
  },
  sectionBody: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: fonts.ui,
  },
  });
}
