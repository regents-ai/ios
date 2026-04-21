import { useCurrentUser, useEvmAddress, useSignOut, useSolanaAddress } from '@coinbase/cdp-hooks';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { APIGuestCheckoutWidget, OnrampForm, useOnramp } from '@/components';
import { CoinbaseAlert } from '@/components/ui/CoinbaseAlerts';
import { WalletHeroCard } from '@/components/wallet/home/wallet-hero-card';
import { WalletOptionsError } from '@/components/wallet/home/wallet-options-error';
import { WalletScreenHeader } from '@/components/wallet/home/wallet-screen-header';
import { WalletDetailsSection } from '@/components/wallet/WalletDetailsSection';
import { COLORS } from '@/constants/Colors';
import { useRegentsAuth } from '@/hooks/useRegentsAuth';
import { usePendingOnrampResume } from '@/hooks/onramp/use-pending-onramp-resume';
import { useWalletAddresses } from '@/hooks/onramp/use-wallet-addresses';
import { useWalletOnrampSubmit } from '@/hooks/onramp/use-wallet-onramp-submit';
import {
  clearPhoneVerifyWasCanceled,
  getPhoneVerifyWasCanceled,
} from '@/utils/state/flowRuntimeState';
import { isTestSessionActive } from '@/utils/state/reviewSessionState';
import { getCountry, getSubdivision } from '@/utils/state/locationState';

const { DARK_BG } = COLORS;

export default function WalletScreen() {
  const [amount, setAmount] = useState('');
  const [regionKey, setRegionKey] = useState(() => `${getCountry()}-${getSubdivision()}`);
  const heroOpacity = useState(() => new Animated.Value(0))[0];
  const heroTranslateY = useState(() => new Animated.Value(14))[0];

  const testSession = isTestSessionActive();
  const { isAuthenticated, signOut: signOutIdentity } = useRegentsAuth();
  const { currentUser } = useCurrentUser();
  const { evmAddress } = useEvmAddress();
  const { solanaAddress } = useSolanaAddress();
  const { signOut: signOutWallet } = useSignOut();
  const effectiveIsSignedIn = testSession || isAuthenticated;

  const { address, onNetworkChange, setAddress } = useWalletAddresses({
    currentUser,
    effectiveIsSignedIn,
    evmAddress,
    solanaAddress,
    testSession,
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
    isSandboxOrder,
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
    Animated.parallel([
      Animated.timing(heroOpacity, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(heroTranslateY, {
        toValue: 0,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [heroOpacity, heroTranslateY]);

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

  return (
    <View style={styles.container}>
      <WalletScreenHeader />
      <WalletHeroCard opacity={heroOpacity} translateY={heroTranslateY} />

      {optionsError && !isLoadingOptions ? (
        <WalletOptionsError message={optionsError} onRetry={() => void fetchOptions()} />
      ) : null}

      <OnrampForm
        address={address}
        amount={amount}
        buyConfig={buyConfig}
        currentQuote={currentQuote}
        fetchQuote={fetchQuote}
        footerContent={<WalletDetailsSection />}
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
        options={options}
        paymentCurrencies={paymentCurrencies}
      />

      {guestCheckoutVisible && activePaymentMethod ? (
        <APIGuestCheckoutWidget
          paymentUrl={hostedUrl}
          paymentMethod={activePaymentMethod as 'GUEST_CHECKOUT_APPLE_PAY' | 'GUEST_CHECKOUT_GOOGLE_PAY'}
          onClose={closeGuestCheckout}
          setIsProcessingPayment={setIsProcessingPayment}
          isSandbox={isSandboxOrder}
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
});
