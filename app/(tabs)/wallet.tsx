import { useCurrentUser, useEvmAddress, useSignOut, useSolanaAddress } from '@coinbase/cdp-hooks';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { APIGuestCheckoutWidget, OnrampForm, useOnramp } from '@/components';
import { LiveValueFlash } from '@/components/motion/LiveValueFlash';
import { StaggerGroup } from '@/components/motion/StaggerGroup';
import { StaggerItem } from '@/components/motion/StaggerItem';
import { CoinbaseAlert } from '@/components/ui/CoinbaseAlerts';
import { RegentPressable } from '@/components/ui/RegentPressable';
import { WalletOptionsError } from '@/components/wallet/home/wallet-options-error';
import { WalletScreenHeader } from '@/components/wallet/home/wallet-screen-header';
import { WalletDetailsSection } from '@/components/wallet/WalletDetailsSection';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { useRegentsAuth } from '@/hooks/useRegentsAuth';
import { usePendingOnrampResume } from '@/hooks/onramp/use-pending-onramp-resume';
import { useWalletAddresses } from '@/hooks/onramp/use-wallet-addresses';
import { useWalletOnrampSubmit } from '@/hooks/onramp/use-wallet-onramp-submit';
import { useWalletDetailsState } from '@/hooks/wallet/useWalletDetailsState';
import { routes } from '@/utils/navigation/routes';
import {
  clearPhoneVerifyWasCanceled,
  getPhoneVerifyWasCanceled,
} from '@/utils/state/flowRuntimeState';
import { getCountry, getSubdivision } from '@/utils/state/locationState';


function formatAddress(address: string) {
  if (address.length <= 16) return address;
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

export default function WalletScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [amount, setAmount] = useState('');
  const [regionKey, setRegionKey] = useState(() => `${getCountry()}-${getSubdivision()}`);
  const [isSwipeActive, setIsSwipeActive] = useState(false);

  const { isAuthenticated, signOut: signOutIdentity } = useRegentsAuth();
  const { currentUser } = useCurrentUser();
  const { evmAddress } = useEvmAddress();
  const { solanaAddress } = useSolanaAddress();
  const { signOut: signOutWallet } = useSignOut();
  const effectiveIsSignedIn = isAuthenticated;
  const walletDetails = useWalletDetailsState();
  const refreshingWallet = walletDetails.loadingBalances || walletDetails.loadingTestnetBalances;

  const { address, onNetworkChange, setAddress } = useWalletAddresses({
    currentUser,
    effectiveIsSignedIn,
    evmAddress,
    solanaAddress,
  });

  const {
    activePaymentMethod,
    buyConfig,
    closeGuestCheckout,
    createOrder,
    createWidgetSession,
    currentQuote,
    fetchOptions,
    fetchQuote,
    getAssetSymbolFromName,
    getAvailableAssets,
    getAvailableNetworks,
    getNetworkNameFromDisplayName,
    guestCheckoutVisible,
    hostedUrl,
    isLoadingOptions,
    isLoadingQuote,
    isProcessingPayment,
    options,
    optionsError,
    paymentCurrencies,
    setIsProcessingPayment,
  } = useOnramp();

  const {
    alertState,
    currentTransaction,
    handleAlertCancel,
    handleAlertConfirm,
    handleSubmit,
    setAlertState,
    setCurrentTransaction,
    showSupportError,
  } = useWalletOnrampSubmit({
    createOrder,
    createWidgetSession,
    currentUser,
    evmAddress,
    getAssetSymbolFromName,
    getNetworkNameFromDisplayName,
    setIsProcessingPayment,
    signOutIdentity,
    signOutWallet,
    solanaAddress,
  });

  usePendingOnrampResume({
    createOrder,
    createWidgetSession,
    currentUser,
    effectiveIsSignedIn,
    evmAddress,
    getAssetSymbolFromName,
    getNetworkNameFromDisplayName,
    onTransactionPrepared: (formData) => {
      setCurrentTransaction({
        amount: formData.amount,
        paymentCurrency: formData.paymentCurrency || 'USD',
        asset: formData.asset,
        network: formData.network,
      });
    },
    setAlertState,
    showSupportError,
    solanaAddress,
  });

  useEffect(() => {
    if (!effectiveIsSignedIn) {
      return;
    }

    void fetchOptions();
  }, [effectiveIsSignedIn, fetchOptions, regionKey]);

  useFocusEffect(
    useCallback(() => {
      if (effectiveIsSignedIn) {
        void fetchOptions();
      }

      if (getPhoneVerifyWasCanceled()) {
        setIsProcessingPayment(false);
        clearPhoneVerifyWasCanceled();
      }
    }, [effectiveIsSignedIn, fetchOptions, setIsProcessingPayment])
  );

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
      onPress: () => router.push(routes.staking()),
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
    <View style={styles.container}>
      <WalletScreenHeader />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardWrap}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
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
          <StaggerGroup>
            <StaggerItem order={0}>
              <View style={styles.summaryCard}>
                <View style={styles.summaryTopRow}>
                  <View style={styles.summaryCopy}>
                    <Text style={styles.summaryEyebrow}>Agent funding</Text>
                    <Text style={styles.summaryTitle}>Add funds for agent work.</Text>
                    <Text style={styles.summaryBody}>
                      Use Apple Pay to add USDC on Base, then send it to an agent working balance.
                    </Text>
                  </View>
                  <View style={styles.statusPill}>
                    <View style={[styles.statusDot, !effectiveIsSignedIn && styles.statusDotIdle]} />
                    <Text style={styles.statusText}>{effectiveIsSignedIn ? 'Ready' : 'Sign in'}</Text>
                  </View>
                </View>

                <View style={styles.summaryStats}>
                  <View style={styles.summaryStat}>
                    <Text style={styles.summaryStatLabel}>Best path</Text>
                    <Text style={styles.summaryStatValue}>Apple Pay to USDC on Base</Text>
                  </View>
                  <View style={styles.summaryStat}>
                    <Text style={styles.summaryStatLabel}>Wallet address</Text>
                    <LiveValueFlash value={address ? formatAddress(address) : 'choose-wallet-address'}>
                      <Text style={styles.summaryStatValue}>
                        {address ? formatAddress(address) : 'Choose a wallet address in Settings'}
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

            {optionsError && !isLoadingOptions ? (
              <StaggerItem order={2}>
                <WalletOptionsError message={optionsError} onRetry={() => void fetchOptions()} />
              </StaggerItem>
            ) : null}

            <StaggerItem order={3}>
              <View style={styles.sectionIntro}>
                <Text style={styles.sectionTitle}>Add USDC</Text>
                <Text style={styles.sectionBody}>
                  Pick an amount, choose Apple Pay when available, and review before USDC is added.
                </Text>
              </View>
            </StaggerItem>

            <StaggerItem order={4}>
              <OnrampForm
                address={address}
                amount={amount}
                buyConfig={buyConfig}
                currentQuote={currentQuote}
                fetchQuote={fetchQuote}
                getAvailableAssets={getAvailableAssets}
                getAvailableNetworks={getAvailableNetworks}
                isLoading={isProcessingPayment}
                isLoadingOptions={isLoadingOptions}
                isLoadingQuote={isLoadingQuote}
                onAddressChange={setAddress}
                onAmountChange={setAmount}
                onNetworkChange={onNetworkChange}
                onRegionChange={(country, subdivision) => setRegionKey(`${country}-${subdivision || ''}`)}
                onSubmit={handleSubmit}
                onSwipeActiveChange={setIsSwipeActive}
                options={options}
                paymentCurrencies={paymentCurrencies}
              />
            </StaggerItem>

            <StaggerItem order={5}>
              <View style={styles.sectionIntro}>
                <Text style={styles.sectionTitle}>Wallet details</Text>
                <Text style={styles.sectionBody}>
                  See your funds, copy your address, and send USDC when an agent needs a budget.
                </Text>
              </View>
            </StaggerItem>

            <StaggerItem order={6}>
              <WalletDetailsSection walletDetails={walletDetails} />
            </StaggerItem>
          </StaggerGroup>
        </ScrollView>
      </KeyboardAvoidingView>

      {guestCheckoutVisible && activePaymentMethod ? (
        <APIGuestCheckoutWidget
          paymentUrl={hostedUrl}
          paymentMethod={activePaymentMethod as 'GUEST_CHECKOUT_APPLE_PAY' | 'GUEST_CHECKOUT_GOOGLE_PAY'}
          onClose={closeGuestCheckout}
          setIsProcessingPayment={setIsProcessingPayment}
          onAlert={(title, message, type) => {
            const transactionSummary = currentTransaction
              ? `\n\n${currentTransaction.amount} ${currentTransaction.paymentCurrency} → ${currentTransaction.asset} (${currentTransaction.network})`
              : '';

            setAlertState({
              visible: true,
              title,
              message: `${message}${transactionSummary}`,
              type,
            });
          }}
        />
      ) : null}

      <CoinbaseAlert
        visible={alertState.visible}
        title={alertState.title}
        message={alertState.message}
        type={alertState.type}
        confirmText={alertState.confirmText}
        cancelText={alertState.cancelText || 'Dismiss'}
        onConfirm={() => void handleAlertConfirm()}
        onCancel={handleAlertCancel}
      />
    </View>
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
  scrollContent: {
    paddingBottom: 28,
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
