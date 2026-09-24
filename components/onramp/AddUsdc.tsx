import { useCurrentUser, useSignOut } from '@coinbase/cdp-hooks';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';

import { APIGuestCheckoutWidget } from '@/components/onramp/APIGuestCheckoutWidget';
import { OnrampForm } from '@/components/onramp/OnrampForm';
import { PURCHASE_ASSET, PURCHASE_NETWORK } from '@/components/onramp/onramp-form-types';
import { CoinbaseAlert } from '@/components/ui/CoinbaseAlerts';
import { WalletOptionsError } from '@/components/wallet/home/wallet-options-error';
import { useOnramp } from '@/hooks/useOnramp';
import { useRegentsAuth } from '@/hooks/useRegentsAuth';
import { usePendingOnrampResume } from '@/hooks/onramp/use-pending-onramp-resume';
import { useWalletOnrampSubmit } from '@/hooks/onramp/use-wallet-onramp-submit';
import { getNetworkLabel } from '@/utils/onchain/networkDisplay';
import { getCountry, getSubdivision } from '@/utils/state/locationState';

type Props = {
  destinationAddress: string;
  destinationLabel: string;
  initialAmount?: string;
  onSwipeActiveChange?: (active: boolean) => void;
};

/** Buys USDC on Base with Apple Pay or card and delivers it to one fixed address. */
export function AddUsdc({ destinationAddress, destinationLabel, initialAmount = '', onSwipeActiveChange }: Props) {
  const [amount, setAmount] = useState(initialAmount);
  const [regionKey, setRegionKey] = useState(() => `${getCountry()}-${getSubdivision()}`);

  const { isAuthenticated, signOut: signOutIdentity } = useRegentsAuth();
  const { currentUser } = useCurrentUser();
  const { signOut: signOutWallet } = useSignOut();

  const {
    activePaymentMethod,
    buyConfig,
    closeGuestCheckout,
    createOrder,
    createWidgetSession,
    currentQuote,
    fetchOptions,
    fetchQuote,
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
    setIsProcessingPayment,
    signOutIdentity,
    signOutWallet,
  });

  usePendingOnrampResume({
    createOrder,
    createWidgetSession,
    currentUser,
    effectiveIsSignedIn: isAuthenticated,
    onTransactionPrepared: (formData) => {
      setCurrentTransaction({
        amount: formData.amount,
        paymentCurrency: formData.paymentCurrency || 'USD',
        asset: PURCHASE_ASSET,
        network: PURCHASE_NETWORK,
      });
    },
    setAlertState,
    showSupportError,
  });

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    void fetchOptions();
  }, [isAuthenticated, fetchOptions, regionKey]);

  useFocusEffect(
    useCallback(() => {
      if (isAuthenticated) {
        void fetchOptions();
      }
    }, [isAuthenticated, fetchOptions])
  );

  return (
    <>
      {optionsError && !isLoadingOptions ? (
        <WalletOptionsError message={optionsError} onRetry={() => void fetchOptions()} />
      ) : null}

      <OnrampForm
        amount={amount}
        buyConfig={buyConfig}
        currentQuote={currentQuote}
        destinationAddress={destinationAddress}
        destinationLabel={destinationLabel}
        fetchQuote={fetchQuote}
        isLoading={isProcessingPayment}
        isLoadingQuote={isLoadingQuote}
        onAmountChange={setAmount}
        onRegionChange={(country, subdivision) => setRegionKey(`${country}-${subdivision || ''}`)}
        onSubmit={handleSubmit}
        onSwipeActiveChange={onSwipeActiveChange}
        options={options}
        paymentCurrencies={paymentCurrencies}
      />

      {guestCheckoutVisible && activePaymentMethod ? (
        <APIGuestCheckoutWidget
          paymentUrl={hostedUrl}
          paymentMethod={activePaymentMethod as 'GUEST_CHECKOUT_APPLE_PAY' | 'GUEST_CHECKOUT_GOOGLE_PAY'}
          onClose={closeGuestCheckout}
          setIsProcessingPayment={setIsProcessingPayment}
          onAlert={(title, message, type) => {
            const transactionSummary = currentTransaction
              ? `\n\n${currentTransaction.amount} ${currentTransaction.paymentCurrency} → ${currentTransaction.asset} (${getNetworkLabel(currentTransaction.network)})`
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
    </>
  );
}
