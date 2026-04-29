import { useCurrentUser } from '@coinbase/cdp-hooks';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';

import { COLORS } from '@/constants/Colors';
import { useRegentsAuth } from '@/hooks/useRegentsAuth';
import { fetchUserLimits, UserLimit } from '@/utils/fetchUserLimits';
import { getAccessTokenGlobal } from '@/utils/getAccessTokenGlobal';
import { getGuestCheckoutBlocker } from '@/utils/onrampEligibility';
import { getCountry, getSubdivision, setCountry, setSubdivision } from '@/utils/state/locationState';
import {
  getLifetimeTransactionThreshold,
  getVerifiedPhone,
  isPhoneFresh60d,
} from '@/utils/state/verificationState';
import { getCurrentWalletAddress, setCurrentNetwork } from '@/utils/state/walletRuntimeState';

import {
  AmountQuoteSection,
  AssetNetworkSection,
  ConfirmationSection,
  EligibilityNoticeSection,
  FocusPathSection,
  LocationSection,
  PaymentMethodSection,
} from './onramp-form-sections';
import type { OnrampFormData } from './onramp-form-types';
import { PickerSheet } from './picker-sheet';

const { DARK_BG } = COLORS;

type OnrampFormProps = {
  address: string;
  amount: string;
  buyConfig?: any;
  currentQuote: any;
  fetchQuote: (formData: any) => void;
  footerContent?: React.ReactNode;
  getAvailableAssets: (selectedNetwork?: string) => any[];
  getAvailableNetworks: (selectedAsset?: string) => any[];
  isLoading: boolean;
  isLoadingOptions: boolean;
  isLoadingQuote: boolean;
  onAddressChange: (address: string) => void;
  onAmountChange: (amount: string) => void;
  onNetworkChange?: (network: string) => void;
  onRegionChange?: (country: string, subdivision: string) => void;
  onSwipeActiveChange?: (active: boolean) => void;
  onSubmit: (data: OnrampFormData) => void;
  options: any;
  paymentCurrencies: string[];
};

type SheetKey = 'asset' | 'country' | 'currency' | 'network' | 'payment' | 'subdivision' | null;

export function OnrampForm({
  address,
  amount,
  buyConfig,
  currentQuote,
  fetchQuote,
  footerContent,
  getAvailableAssets,
  getAvailableNetworks,
  isLoading,
  isLoadingOptions,
  isLoadingQuote,
  onAddressChange,
  onAmountChange,
  onNetworkChange,
  onRegionChange,
  onSwipeActiveChange,
  onSubmit,
  options,
  paymentCurrencies,
}: OnrampFormProps) {
  const { isAuthenticated, linkedEmail, linkedPhone } = useRegentsAuth();
  const { currentUser } = useCurrentUser();
  const prevNetworkRef = useRef('Base');

  const [asset, setAsset] = useState('USDC');
  const [network, setNetwork] = useState('Base');
  const [paymentMethod, setPaymentMethod] = useState('GUEST_CHECKOUT_APPLE_PAY');
  const [paymentCurrency, setPaymentCurrency] = useState('USD');
  const [country, setCountryLocal] = useState(getCountry());
  const [subdivision, setSubdivisionLocal] = useState(getSubdivision());
  const [activeSheet, setActiveSheet] = useState<SheetKey>(null);
  const [userLimits, setUserLimits] = useState<{ weekly: UserLimit; lifetime: UserLimit } | null>(null);
  const [isLoadingLimits, setIsLoadingLimits] = useState(false);

  const isApplePay = paymentMethod === 'GUEST_CHECKOUT_APPLE_PAY';
  const isGooglePay = paymentMethod === 'GUEST_CHECKOUT_GOOGLE_PAY';
  const isGuestCheckout = isApplePay || isGooglePay;
  const isBaseUsdcPath = asset === 'USDC' && network === 'Base';

  const countries = useMemo(() => {
    const source = buyConfig?.countries ?? options?.countries;
    return source?.map((entry: any) => entry.id).filter(Boolean) ?? [];
  }, [buyConfig, options]);

  const usSubs = useMemo(() => {
    const source = buyConfig?.countries ?? options?.countries;
    return source?.find((entry: any) => entry.id === 'US')?.subdivisions ?? [];
  }, [buyConfig, options]);

  const availableNetworks = useMemo(() => getAvailableNetworks(asset), [asset, getAvailableNetworks]);
  const availableAssets = useMemo(() => getAvailableAssets(network), [getAvailableAssets, network]);

  const displayCurrencies = useMemo(() => {
    const list = Array.isArray(paymentCurrencies) && paymentCurrencies.length ? paymentCurrencies : ['USD'];
    return isGuestCheckout ? ['USD'] : list;
  }, [isGuestCheckout, paymentCurrencies]);

  const methods = useMemo(() => {
    const items = [{ display: 'More payment options', value: 'COINBASE_WIDGET' }];
    if (country === 'US' && paymentCurrency === 'USD') {
      if (Platform.OS === 'android') {
        items.push({ display: 'Google Pay', value: 'GUEST_CHECKOUT_GOOGLE_PAY' });
      } else if (Platform.OS === 'ios') {
        items.push({ display: 'Apple Pay', value: 'GUEST_CHECKOUT_APPLE_PAY' });
      }
    }
    return items;
  }, [country, paymentCurrency]);

  const amountNumber = useMemo(() => {
    const parsed = Number.parseFloat(amount.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : NaN;
  }, [amount]);

  const verifiedPhone = getVerifiedPhone();
  const hasFreshVerifiedPhone = !!linkedPhone && verifiedPhone === linkedPhone && isPhoneFresh60d();
  const guestCheckoutBlocker = getGuestCheckoutBlocker({
    isGuestCheckout,
    country,
    linkedEmail,
    linkedPhone,
    hasFreshVerifiedPhone,
  });
  const needsGuestCheckoutVerification = guestCheckoutBlocker === 'verification';
  const isUnsupportedGuestCheckoutRegion = guestCheckoutBlocker === 'region';

  const isEvmNetwork = useMemo(() => {
    const normalized = network.toLowerCase();
    return [
      'ethereum',
      'base',
      'polygon',
      'arbitrum',
      'optimism',
      'avalanche',
      'avax',
      'bsc',
      'fantom',
      'linea',
      'zksync',
      'scroll',
    ].some(key => normalized.includes(key));
  }, [network]);

  const isSolanaNetwork = useMemo(() => {
    const normalized = network.toLowerCase();
    return ['solana', 'sol'].some(key => normalized.includes(key));
  }, [network]);

  const smartAccount = useMemo(() => {
    return currentUser?.evmSmartAccounts?.[0] as string | undefined;
  }, [currentUser]);

  const isAmountValid = Number.isFinite(amountNumber) && amountNumber > 0;
  const isEvmAddressValid = /^0x[0-9a-fA-F]{40}$/.test(address);
  const isSolanaAddressValid =
    !!address &&
    address.length >= 32 &&
    address.length <= 44 &&
    /^[1-9A-HJ-NP-Za-km-z]+$/.test(address);
  const needsSmartAccount = isEvmNetwork;
  const hasSmartAccount = !!smartAccount;
  const hasValidAddress = isEvmNetwork
    ? isEvmAddressValid
    : isSolanaNetwork
      ? isSolanaAddressValid
      : false;
  const isFormValid = isAmountValid && !!network && !!asset && hasValidAddress && (!needsSmartAccount || hasSmartAccount);

  const currencyLimits = useMemo(() => {
    if (!options?.payment_currencies) {
      return null;
    }

    const currency = options.payment_currencies.find((entry: any) => entry.id === paymentCurrency);
    if (!currency?.limits) {
      return null;
    }

    if (isGuestCheckout) {
      return {
        min: 2,
        max: 1000,
        currency: paymentCurrency,
        display: `$2 - $1000 ${paymentCurrency}`,
        quotePaymentMethod: paymentMethod,
      };
    }

    const allLimits = currency.limits || [];
    if (!allLimits.length) {
      return null;
    }

    let bestMethod = 'CARD';
    if (Number.isFinite(amountNumber) && amountNumber > 0) {
      const cardLimit = allLimits.find((entry: any) => entry.id === 'CARD');
      if (!(cardLimit && amountNumber >= Number(cardLimit.min) && amountNumber <= Number(cardLimit.max))) {
        const validMethods = allLimits.filter((entry: any) => {
          const min = Number(entry.min);
          const max = Number(entry.max);
          return amountNumber >= min && amountNumber <= max && Number(entry.max) > Number(cardLimit?.max || 0);
        });

        if (validMethods.length > 0) {
          bestMethod = validMethods.reduce((best: any, current: any) =>
            Number(current.max) > Number(best.max) ? current : best
          ).id;
        }
      }
    }

    return {
      min: Math.min(...allLimits.map((entry: any) => Number(entry.min))),
      max: Math.max(...allLimits.map((entry: any) => Number(entry.max))),
      currency: paymentCurrency,
      display: allLimits
        .map((entry: any) => `${entry.id.replace('_', ' ').toLowerCase()}: ${Number(entry.min).toLocaleString()}-${Number(entry.max).toLocaleString()} ${paymentCurrency}`)
        .join(' • '),
      quotePaymentMethod: bestMethod,
    };
  }, [amountNumber, isGuestCheckout, options, paymentCurrency, paymentMethod]);

  const limitsValidation = useMemo(() => {
    if (!userLimits || !isGuestCheckout) {
      return { isValid: true, error: null as string | null, warning: null as string | null };
    }

    const weeklyRemaining = parseFloat(userLimits.weekly.remaining);
    const lifetimeRemaining = parseInt(userLimits.lifetime.remaining, 10);
    const threshold = getLifetimeTransactionThreshold();

    if (lifetimeRemaining === 0) {
      return {
        isValid: false,
        error: 'You have reached your lifetime transaction limit for Apple Pay. Please contact support.',
        warning: null,
      };
    }

    if (isAmountValid && amountNumber > weeklyRemaining) {
      return {
        isValid: false,
        error: `Amount exceeds your weekly limit. You have $${weeklyRemaining} ${userLimits.weekly.currency} remaining this week.`,
        warning: null,
      };
    }

    if (lifetimeRemaining < threshold) {
      return {
        isValid: true,
        error: null,
        warning: `⚠️ You have ${lifetimeRemaining} transaction${lifetimeRemaining === 1 ? '' : 's'} remaining before reaching your limit.`,
      };
    }

    return { isValid: true, error: null, warning: null };
  }, [amountNumber, isAmountValid, isGuestCheckout, userLimits]);

  const isFormValidWithLimits = isFormValid && limitsValidation.isValid && !guestCheckoutBlocker;

  const amountError = useMemo(() => {
    if (!currencyLimits || !amount || !Number.isFinite(amountNumber)) {
      return null;
    }
    if (amountNumber < currencyLimits.min) {
      return `Minimum amount is ${currencyLimits.min.toLocaleString()} ${currencyLimits.currency}`;
    }
    if (amountNumber > currencyLimits.max) {
      return `Maximum amount is ${currencyLimits.max.toLocaleString()} ${currencyLimits.currency}`;
    }
    return null;
  }, [amount, amountNumber, currencyLimits]);

  useEffect(() => {
    if (isGuestCheckout && paymentCurrency !== 'USD') {
      setPaymentCurrency('USD');
    }
  }, [isGuestCheckout, paymentCurrency]);

  useEffect(() => {
    if (!displayCurrencies.includes(paymentCurrency)) {
      setPaymentCurrency(displayCurrencies[0] || 'USD');
    }
  }, [displayCurrencies, paymentCurrency]);

  useEffect(() => {
    if (!methods.some(method => method.value === paymentMethod)) {
      setPaymentMethod(methods[0]?.value || 'COINBASE_WIDGET');
    }
  }, [methods, paymentMethod]);

  useEffect(() => {
    setCurrentNetwork(network);
    onNetworkChange?.(network);
  }, [network, onNetworkChange]);

  useEffect(() => {
    if (prevNetworkRef.current === network) {
      return;
    }

    prevNetworkRef.current = network;
    if (isEvmNetwork || isSolanaNetwork) {
      const nextAddress = getCurrentWalletAddress();
      if (nextAddress && nextAddress !== address) {
        onAddressChange(nextAddress);
      }
    }
  }, [address, isEvmNetwork, isSolanaNetwork, network, onAddressChange]);

  useEffect(() => {
    if (!isEvmNetwork && !isSolanaNetwork && address) {
      onAddressChange('');
    }
  }, [address, isEvmNetwork, isSolanaNetwork, onAddressChange]);

  useEffect(() => {
    if (asset && availableNetworks.length > 0) {
      const exists = availableNetworks.some((entry: any) => entry.display_name === network || entry.name === network);
      if (!exists) {
        const nextNetwork = availableNetworks[0];
        setNetwork(nextNetwork?.display_name || nextNetwork?.name || '');
      }
    }
  }, [asset, availableNetworks, network]);

  useEffect(() => {
    if (network && availableAssets.length > 0) {
      const exists = availableAssets.some((entry: any) => entry.name === asset || entry.symbol === asset);
      if (!exists) {
        const nextAsset = availableAssets[0];
        setAsset(nextAsset?.name || nextAsset?.symbol || '');
      }
    }
  }, [asset, availableAssets, network]);

  const fetchUserLimitsData = useCallback(async () => {
    const freshPhone = getVerifiedPhone();
    const isFresh = isPhoneFresh60d();

    if (!isGuestCheckout || !freshPhone || !isFresh) {
      setUserLimits(null);
      return;
    }

    setIsLoadingLimits(true);
    try {
      const accessToken = await getAccessTokenGlobal();
      if (!accessToken) {
        setUserLimits(null);
        return;
      }

      const response = await fetchUserLimits(freshPhone, accessToken);
      const weeklyLimit = response.limits.find(entry => entry.limitType === 'weekly_spending');
      const lifetimeLimit = response.limits.find(entry => entry.limitType === 'lifetime_transactions');
      setUserLimits(weeklyLimit && lifetimeLimit ? { weekly: weeklyLimit, lifetime: lifetimeLimit } : null);
    } catch (error) {
      console.error('❌ Error fetching user limits:', error);
      setUserLimits(null);
    } finally {
      setIsLoadingLimits(false);
    }
  }, [isGuestCheckout]);

  useEffect(() => {
    void fetchUserLimitsData();
  }, [fetchUserLimitsData]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (!amount || !asset || !network) {
        return;
      }

      const quoteMethod = currencyLimits?.quotePaymentMethod || 'CARD';
      fetchQuote({
        amount,
        asset,
        network,
        paymentCurrency,
        paymentMethod: paymentMethod === 'COINBASE_WIDGET' ? quoteMethod : paymentMethod,
      });
      void fetchUserLimitsData();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [amount, asset, currencyLimits?.quotePaymentMethod, fetchQuote, fetchUserLimitsData, network, paymentCurrency, paymentMethod]);

  const handleSwipeConfirm = useCallback(
    (reset: () => void) => {
      if (!isFormValidWithLimits) {
        reset();
        return;
      }

      onSubmit({
        amount,
        asset,
        network,
        address,
        paymentMethod,
        paymentCurrency,
        agreementAcceptedAt: new Date().toISOString(),
      });
    },
    [address, amount, asset, isFormValidWithLimits, network, onSubmit, paymentCurrency, paymentMethod]
  );

  const applyBaseUsdcPath = useCallback(() => {
    setAsset('USDC');
    setNetwork('Base');
    if (paymentCurrency !== 'USD') {
      setPaymentCurrency('USD');
    }
  }, [paymentCurrency]);

  const notices = useMemo(() => {
    const nextNotices: { title: string; message: string; tone?: 'warning' | 'error' | 'info' }[] = [];

    if (isUnsupportedGuestCheckoutRegion) {
      nextNotices.push({
        title: 'Region not supported',
        message:
          'Apple Pay checkout from this app is only available in the United States right now. Use More payment options instead.',
        tone: 'warning',
      });
    }

    if (needsGuestCheckoutVerification) {
      nextNotices.push({
        title: 'Verification needed',
        message: linkedEmail
          ? linkedPhone
            ? 'Verify your phone again before using Apple Pay from this app.'
            : 'Link a phone number before using Apple Pay from this app.'
          : 'Link an email and phone number before using Apple Pay from this app.',
        tone: 'error',
      });
    }

    if (!isEvmNetwork && !isSolanaNetwork) {
      nextNotices.push({
        title: 'Choose a supported network',
        message:
          'This wallet can buy on Base, Ethereum, and Solana right now.',
        tone: 'warning',
      });
    } else if (needsSmartAccount && !hasSmartAccount) {
      nextNotices.push({
        title: 'Wallet setup needed',
        message: 'This network is almost ready. Finish setting up your wallet, then come back to buy.',
        tone: 'error',
      });
    } else if (!hasValidAddress) {
      nextNotices.push({
        title: 'Wallet needed',
        message: `Connect a valid ${isEvmNetwork ? 'Base or Ethereum' : isSolanaNetwork ? 'Solana' : 'wallet'} address to continue.`,
        tone: 'error',
      });
    } else if (isAuthenticated) {
      nextNotices.push({
        title: 'Live mode',
        message: address
          ? `Successful purchases will move real money.\n\nBuying to: ${address}`
          : 'Successful purchases will move real money.',
        tone: 'error',
      });
    }

    if (limitsValidation.error) {
      nextNotices.push({ title: 'Limit reached', message: limitsValidation.error, tone: 'error' });
    } else if (limitsValidation.warning) {
      nextNotices.push({ title: 'Running low', message: limitsValidation.warning, tone: 'warning' });
    }

    return nextNotices;
  }, [
    address,
    hasSmartAccount,
    hasValidAddress,
    isAuthenticated,
    isEvmNetwork,
    isSolanaNetwork,
    isUnsupportedGuestCheckoutRegion,
    limitsValidation.error,
    limitsValidation.warning,
    linkedEmail,
    linkedPhone,
    needsGuestCheckoutVerification,
    needsSmartAccount,
  ]);

  const assetIconUrl = availableAssets.find((entry: any) => entry.name === asset || entry.symbol === asset)?.icon_url || null;
  const networkIconUrl =
    availableNetworks.find((entry: any) => entry.display_name === network || entry.name === network)?.icon_url || null;
  const paymentMethodLabel = methods.find(method => method.value === paymentMethod)?.display || paymentMethod;

  const openGuestCheckoutTerms = useCallback(() => Linking.openURL('https://www.coinbase.com/legal/guest-checkout/us'), []);
  const openUserAgreement = useCallback(
    () => Linking.openURL('https://www.coinbase.com/legal/user_agreement/united_states'),
    []
  );
  const openPrivacyPolicy = useCallback(() => Linking.openURL('https://www.coinbase.com/legal/privacy'), []);
  const handleSwipeStart = useCallback(() => onSwipeActiveChange?.(true), [onSwipeActiveChange]);
  const handleSwipeEnd = useCallback(() => onSwipeActiveChange?.(false), [onSwipeActiveChange]);

  const handleCountrySelect = useCallback(
    (nextCountry: string) => {
      setCountry(nextCountry);
      setCountryLocal(nextCountry);

      let nextSubdivision = '';
      if (nextCountry === 'US') {
        nextSubdivision = getSubdivision() || 'CA';
        setSubdivision(nextSubdivision);
        setSubdivisionLocal(nextSubdivision);
      } else {
        setSubdivision('');
        setSubdivisionLocal('');
      }

      onRegionChange?.(nextCountry, nextSubdivision);
    },
    [onRegionChange]
  );

  const handleSubdivisionSelect = useCallback(
    (nextSubdivision: string) => {
      setSubdivision(nextSubdivision);
      setSubdivisionLocal(nextSubdivision);
      onRegionChange?.(country, nextSubdivision);
    },
    [country, onRegionChange]
  );

  return (
    <View style={styles.content}>
      <FocusPathSection isBaseUsdcPath={isBaseUsdcPath} onPress={applyBaseUsdcPath} />
      <AmountQuoteSection
        amount={amount}
        amountError={amountError}
        currentQuote={currentQuote}
        isApplePay={isApplePay}
        isGooglePay={isGooglePay}
        isLoadingLimits={isLoadingLimits}
        isLoadingQuote={isLoadingQuote}
        isValidAmount={isAmountValid}
        limits={currencyLimits}
        onAmountChange={onAmountChange}
        onOpenPaymentCurrencyPicker={() => setActiveSheet('currency')}
        paymentCurrency={paymentCurrency}
        quoteDisclaimer={
          currentQuote && paymentMethod === 'COINBASE_WIDGET' && currencyLimits?.quotePaymentMethod
            ? `This estimate is based on ${currencyLimits.quotePaymentMethod}. Final pricing may change if you pick a different payment method during checkout.`
            : null
        }
        userLimits={userLimits}
      />
      <AssetNetworkSection
        asset={asset}
        assetIconUrl={assetIconUrl}
        isBaseUsdcPath={isBaseUsdcPath}
        network={network}
        networkIconUrl={networkIconUrl}
        onOpenAssetPicker={() => setActiveSheet('asset')}
        onOpenNetworkPicker={() => setActiveSheet('network')}
      />
      <PaymentMethodSection paymentMethodLabel={paymentMethodLabel} onOpenPaymentPicker={() => setActiveSheet('payment')} />
      <EligibilityNoticeSection notices={notices} />
      <ConfirmationSection
        disabled={!isFormValidWithLimits}
        footerContent={footerContent}
        isBaseUsdcPath={isBaseUsdcPath}
        isLoading={isLoading}
        onOpenGuestCheckoutTerms={openGuestCheckoutTerms}
        onOpenPrivacyPolicy={openPrivacyPolicy}
        onOpenUserAgreement={openUserAgreement}
        onSwipeConfirm={handleSwipeConfirm}
        onSwipeEnd={handleSwipeEnd}
        onSwipeStart={handleSwipeStart}
      />
      <LocationSection
        country={country}
        subdivision={subdivision}
        onOpenCountryPicker={() => setActiveSheet('country')}
        onOpenSubdivisionPicker={() => setActiveSheet('subdivision')}
      />

      <PickerSheet
        visible={activeSheet === 'currency'}
        onClose={() => setActiveSheet(null)}
        items={displayCurrencies.map(currency => ({ key: currency, label: currency, selected: currency === paymentCurrency }))}
        onSelect={setPaymentCurrency}
      />
      <PickerSheet
        visible={activeSheet === 'asset'}
        onClose={() => setActiveSheet(null)}
        items={availableAssets.map((entry: any, index: number) => ({
          key: entry.name || entry.symbol || `asset-${index}`,
          label: entry.name || entry.symbol || 'Unknown Asset',
          iconUrl: entry.icon_url,
          selected: (entry.name || entry.symbol) === asset,
        }))}
        onSelect={(item) => setAsset(item)}
      />
      <PickerSheet
        visible={activeSheet === 'network'}
        onClose={() => setActiveSheet(null)}
        items={availableNetworks.map((entry: any, index: number) => ({
          key: entry.display_name || entry.name || `network-${index}`,
          label: entry.display_name || entry.name || 'Unknown Network',
          iconUrl: entry.icon_url,
          selected: (entry.display_name || entry.name) === network,
        }))}
        onSelect={(item) => setNetwork(item)}
        loadingLabel={isLoadingOptions ? 'Loading networks...' : undefined}
      />
      <PickerSheet
        visible={activeSheet === 'payment'}
        onClose={() => setActiveSheet(null)}
        items={methods.map(method => ({ key: method.value, label: method.display, selected: method.value === paymentMethod }))}
        onSelect={(item) => setPaymentMethod(item)}
      />
      <PickerSheet
        visible={activeSheet === 'country'}
        onClose={() => setActiveSheet(null)}
        items={countries.map((entry: string) => ({ key: entry, label: entry, selected: entry === country }))}
        onSelect={handleCountrySelect}
      />
      <PickerSheet
        visible={activeSheet === 'subdivision'}
        onClose={() => setActiveSheet(null)}
        items={usSubs.map((entry: string) => ({ key: entry, label: entry, selected: entry === subdivision }))}
        onSelect={handleSubdivisionSelect}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    gap: 14,
    backgroundColor: DARK_BG,
    paddingBottom: 20,
  },
});
