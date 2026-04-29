import { useCurrentUser, useEvmAddress, useSignOut, useSolanaAddress } from '@coinbase/cdp-hooks';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { APIGuestCheckoutWidget, OnrampForm, useOnramp } from '@/components';
import { StaggerGroup } from '@/components/motion/StaggerGroup';
import { StaggerItem } from '@/components/motion/StaggerItem';
import { CoinbaseAlert } from '@/components/ui/CoinbaseAlerts';
import { WalletOptionsError } from '@/components/wallet/home/wallet-options-error';
import { WalletScreenHeader } from '@/components/wallet/home/wallet-screen-header';
import { WalletDetailsSection } from '@/components/wallet/WalletDetailsSection';
import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import { useRegentsAuth } from '@/hooks/useRegentsAuth';
import { usePendingOnrampResume } from '@/hooks/onramp/use-pending-onramp-resume';
import { useWalletAddresses } from '@/hooks/onramp/use-wallet-addresses';
import { useWalletOnrampSubmit } from '@/hooks/onramp/use-wallet-onramp-submit';
import {
  clearPhoneVerifyWasCanceled,
  getPhoneVerifyWasCanceled,
} from '@/utils/state/flowRuntimeState';
import { getCountry, getSubdivision } from '@/utils/state/locationState';

const { DARK_BG, CARD_BG, CARD_ALT, TEXT_PRIMARY, TEXT_SECONDARY, BLUE, BORDER, WHITE, SUCCESS } = COLORS;

function formatAddress(address: string) {
  if (address.length <= 16) return address;
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

export default function WalletScreen() {
  const router = useRouter();
  const [amount, setAmount] = useState('');
  const [regionKey, setRegionKey] = useState(() => `${getCountry()}-${getSubdivision()}`);
  const [isSwipeActive, setIsSwipeActive] = useState(false);

  const { isAuthenticated, signOut: signOutIdentity } = useRegentsAuth();
  const { currentUser } = useCurrentUser();
  const { evmAddress } = useEvmAddress();
  const { solanaAddress } = useSolanaAddress();
  const { signOut: signOutWallet } = useSignOut();
  const effectiveIsSignedIn = isAuthenticated;

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
      label: 'Send',
      detail: 'Move money from your wallet',
      icon: 'arrow-up-outline',
      onPress: () => router.push('/wallet/send'),
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
          scrollEnabled={!isSwipeActive}
        >
          <StaggerGroup>
            <StaggerItem order={0}>
              <View style={styles.summaryCard}>
                <View style={styles.summaryTopRow}>
                  <View style={styles.summaryCopy}>
                    <Text style={styles.summaryEyebrow}>Regents wallet</Text>
                    <Text style={styles.summaryTitle}>Keep money movement simple.</Text>
                    <Text style={styles.summaryBody}>
                      Add cash below, then use the rest of the wallet tools when you need them.
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
                    <Text style={styles.summaryStatValue}>Base and USDC</Text>
                  </View>
                  <View style={styles.summaryStat}>
                    <Text style={styles.summaryStatLabel}>Wallet address</Text>
                    <Text style={styles.summaryStatValue}>
                      {address ? formatAddress(address) : 'Choose a wallet address in Settings'}
                    </Text>
                  </View>
                </View>
              </View>
            </StaggerItem>

            <StaggerItem order={1}>
              <View style={styles.quickActionList}>
                {quickActions.map((action) => (
                  <Pressable
                    key={action.label}
                    style={({ pressed }) => [styles.quickActionCard, pressed && styles.quickActionCardPressed]}
                    onPress={action.onPress}
                  >
                    <View style={styles.quickActionRow}>
                      <View style={styles.quickActionIcon}>
                        <Ionicons name={action.icon} size={20} color={BLUE} />
                      </View>
                      <View style={styles.quickActionCopy}>
                        <Text style={styles.quickActionLabel}>{action.label}</Text>
                        <Text style={styles.quickActionDetail}>{action.detail}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={TEXT_SECONDARY} />
                    </View>
                  </Pressable>
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
                <Text style={styles.sectionTitle}>Add cash</Text>
                <Text style={styles.sectionBody}>
                  Pick an amount, choose how you want to pay, and review before you continue.
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
                  See your balances, copy your address, and take the next step without digging around.
                </Text>
              </View>
            </StaggerItem>

            <StaggerItem order={6}>
              <WalletDetailsSection />
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DARK_BG,
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
    backgroundColor: CARD_BG,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: BORDER,
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
    gap: 8,
  },
  summaryEyebrow: {
    color: BLUE,
    fontSize: 12,
    fontFamily: FONTS.heading,
  },
  summaryTitle: {
    color: TEXT_PRIMARY,
    fontSize: 28,
    lineHeight: 31,
    fontFamily: FONTS.heading,
  },
  summaryBody: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: FONTS.body,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: SUCCESS,
  },
  statusDotIdle: {
    backgroundColor: BORDER,
  },
  statusText: {
    color: TEXT_PRIMARY,
    fontSize: 11,
    fontFamily: FONTS.body,
  },
  summaryStats: {
    gap: 10,
  },
  summaryStat: {
    padding: 14,
    borderRadius: 18,
    backgroundColor: CARD_ALT,
    gap: 4,
  },
  summaryStatLabel: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    fontFamily: FONTS.body,
  },
  summaryStatValue: {
    color: TEXT_PRIMARY,
    fontSize: 15,
    fontFamily: FONTS.heading,
  },
  quickActionList: {
    marginHorizontal: 16,
    gap: 12,
  },
  quickActionCard: {
    padding: 16,
    borderRadius: 22,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    minHeight: 84,
    alignSelf: 'stretch',
  },
  quickActionCardPressed: {
    transform: [{ scale: 0.98 }],
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
    backgroundColor: WHITE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionCopy: {
    flex: 1,
    gap: 2,
  },
  quickActionLabel: {
    color: TEXT_PRIMARY,
    fontSize: 16,
    fontFamily: FONTS.heading,
  },
  quickActionDetail: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: FONTS.body,
  },
  sectionIntro: {
    marginHorizontal: 16,
    marginTop: 4,
    gap: 4,
  },
  sectionTitle: {
    color: TEXT_PRIMARY,
    fontSize: 22,
    fontFamily: FONTS.heading,
  },
  sectionBody: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: FONTS.body,
  },
});
