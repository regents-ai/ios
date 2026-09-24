import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';

import { useTheme, type Theme } from '@/theme/ThemeProvider';
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
import { paymentMethodLabel as describePaymentMethod } from '@/utils/onramp/paymentMethodLabel';
import { MAX_PURCHASE_USD, MIN_PURCHASE_USD } from '@/utils/onramp/purchaseLimits';

import {
  AmountQuoteSection,
  ConfirmationSection,
  EligibilityNoticeSection,
  LocationSection,
  PaymentMethodSection,
} from './onramp-form-sections';
import type { OnrampFormData } from './onramp-form-types';
import { PickerSheet } from './picker-sheet';

type OnrampFormProps = {
  amount: string;
  buyConfig?: any;
  currentQuote: any;
  destinationAddress: string;
  destinationLabel: string;
  fetchQuote: (formData: any) => void;
  isLoading: boolean;
  isLoadingQuote: boolean;
  onAmountChange: (amount: string) => void;
  onRegionChange?: (country: string, subdivision: string) => void;
  onSwipeActiveChange?: (active: boolean) => void;
  onSubmit: (data: OnrampFormData) => void;
  options: any;
  paymentCurrencies: string[];
};

type SheetKey = 'country' | 'currency' | 'payment' | 'subdivision' | null;

export function OnrampForm({
  amount,
  buyConfig,
  currentQuote,
  destinationAddress,
  destinationLabel,
  fetchQuote,
  isLoading,
  isLoadingQuote,
  onAmountChange,
  onRegionChange,
  onSwipeActiveChange,
  onSubmit,
  options,
  paymentCurrencies,
}: OnrampFormProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { isAuthenticated, linkedEmail, linkedPhone } = useRegentsAuth();

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

  const countries = useMemo(() => {
    const source = buyConfig?.countries ?? options?.countries;
    return source?.map((entry: any) => entry.id).filter(Boolean) ?? [];
  }, [buyConfig, options]);

  const usSubs = useMemo(() => {
    const source = buyConfig?.countries ?? options?.countries;
    return source?.find((entry: any) => entry.id === 'US')?.subdivisions ?? [];
  }, [buyConfig, options]);

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

  const isAmountValid = Number.isFinite(amountNumber) && amountNumber > 0;

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
        min: MIN_PURCHASE_USD,
        max: MAX_PURCHASE_USD,
        currency: paymentCurrency,
        display: `$${MIN_PURCHASE_USD} - $${MAX_PURCHASE_USD} ${paymentCurrency}`,
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
        .map((entry: any) => `${describePaymentMethod(entry.id)}: ${Number(entry.min).toLocaleString()}-${Number(entry.max).toLocaleString()} ${paymentCurrency}`)
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
        warning: `You have ${lifetimeRemaining} purchase${lifetimeRemaining === 1 ? '' : 's'} left before you reach your limit.`,
      };
    }

    return { isValid: true, error: null, warning: null };
  }, [amountNumber, isAmountValid, isGuestCheckout, userLimits]);

  const isFormValidWithLimits = isAmountValid && limitsValidation.isValid && !guestCheckoutBlocker;

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
      if (!amount) {
        return;
      }

      const quoteMethod = currencyLimits?.quotePaymentMethod || 'CARD';
      fetchQuote({
        amount,
        destinationAddress,
        paymentCurrency,
        paymentMethod: paymentMethod === 'COINBASE_WIDGET' ? quoteMethod : paymentMethod,
      });
      void fetchUserLimitsData();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [amount, currencyLimits?.quotePaymentMethod, destinationAddress, fetchQuote, fetchUserLimitsData, paymentCurrency, paymentMethod]);

  const handleSwipeConfirm = useCallback(
    (reset: () => void) => {
      if (!isFormValidWithLimits) {
        reset();
        return;
      }

      onSubmit({
        amount,
        address: destinationAddress,
        paymentMethod,
        paymentCurrency,
        agreementAcceptedAt: new Date().toISOString(),
      });
    },
    [amount, destinationAddress, isFormValidWithLimits, onSubmit, paymentCurrency, paymentMethod]
  );

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

    if (isAuthenticated) {
      nextNotices.push({
        title: 'Real money',
        message: `Successful purchases will move real money.\n\nUSDC on Base goes to ${destinationLabel}: ${destinationAddress}`,
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
    destinationAddress,
    destinationLabel,
    isAuthenticated,
    isUnsupportedGuestCheckoutRegion,
    limitsValidation.error,
    limitsValidation.warning,
    linkedEmail,
    linkedPhone,
    needsGuestCheckoutVerification,
  ]);

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
            ? `This estimate assumes you pay with ${describePaymentMethod(currencyLimits.quotePaymentMethod)}. Final pricing may change if you pick a different payment method during checkout.`
            : null
        }
        userLimits={userLimits}
      />
      <PaymentMethodSection paymentMethodLabel={paymentMethodLabel} onOpenPaymentPicker={() => setActiveSheet('payment')} />
      <EligibilityNoticeSection notices={notices} />
      <ConfirmationSection
        disabled={!isFormValidWithLimits}
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

function makeStyles({ colors }: Theme) {
  return StyleSheet.create({
  content: {
    padding: 16,
    gap: 14,
    backgroundColor: colors.bg,
    paddingBottom: 20,
  },
  });
}
