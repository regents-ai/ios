import { useCallback, useState } from 'react';

import { useCurrentUser } from '@coinbase/cdp-hooks';

import type { OnrampFormData } from '@/components/onramp/onramp-form-types';
import { createGuestCheckoutOrder } from '@/utils/createGuestCheckoutOrder';
import { createOnrampSession } from '@/utils/createOnrampSession';
import { getAccessTokenGlobal } from '@/utils/getAccessTokenGlobal';
import { registerForPushNotifications, sendPushTokenToServer } from '@/utils/pushNotifications';
import { getCountry, getSubdivision, setSubdivision } from '@/utils/state/locationState';
import { setCurrentPartnerUserRef } from '@/utils/state/flowRuntimeState';
import { getVerifiedPhone, getVerifiedPhoneAt, isPhoneFresh60d } from '@/utils/state/verificationState';

type UseOnrampCheckoutArgs = {
  getAssetSymbolFromName: (assetName: string) => string;
  getNetworkNameFromDisplayName: (displayName: string) => string;
  linkedEmail?: string | null;
  linkedPhone?: string | null;
  regentsUserId?: string | null;
};

async function registerTransactionPushToken(partnerUserRef: string) {
  try {
    const pushToken = await registerForPushNotifications();
    if (pushToken) {
      await sendPushTokenToServer(pushToken.token, partnerUserRef, getAccessTokenGlobal, pushToken.type);
    }
  } catch (error) {
    console.warn('⚠️ [TRANSACTION] Failed to register push token:', error);
  }
}

export function useOnrampCheckout({
  getAssetSymbolFromName,
  getNetworkNameFromDisplayName,
  linkedEmail,
  linkedPhone,
  regentsUserId,
}: UseOnrampCheckoutArgs) {
  const { currentUser } = useCurrentUser();
  const [guestCheckoutVisible, setGuestCheckoutVisible] = useState(false);
  const [activePaymentMethod, setActivePaymentMethod] = useState<string | null>(null);
  const [hostedUrl, setHostedUrl] = useState('');
  const [transactionStatus, setTransactionStatus] = useState<'pending' | 'success' | 'error' | null>(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  const createOrder = useCallback(
    async (formData: OnrampFormData) => {
      try {
        setIsProcessingPayment(true);

        const paymentMethodValue = formData.paymentMethod || 'GUEST_CHECKOUT_APPLE_PAY';
        const paymentLabel = paymentMethodValue === 'GUEST_CHECKOUT_GOOGLE_PAY' ? 'Google Pay' : 'Apple Pay';
        const partnerUserRef = regentsUserId || 'unknown-user';

        setCurrentPartnerUserRef(partnerUserRef);
        await registerTransactionPushToken(partnerUserRef);

        const userEmail = linkedEmail || null;
        const cdpPhone = linkedPhone || null;

        let phone = getVerifiedPhone();
        let phoneAt = getVerifiedPhoneAt();

        if (!userEmail) {
          const error: any = new Error(`Email verification required for ${paymentLabel}`);
          error.code = 'MISSING_EMAIL';
          throw error;
        }

        if (!cdpPhone) {
          const error: any = new Error(`Phone verification required for ${paymentLabel}`);
          error.code = 'MISSING_PHONE';
          throw error;
        }

        if (phone !== cdpPhone || !isPhoneFresh60d()) {
          const error: any = new Error(`Phone verification required for ${paymentLabel}. Please verify your phone on the Profile page.`);
          error.code = 'MISSING_PHONE';
          throw error;
        }

        if (!phone || !isPhoneFresh60d()) {
          const error: any = new Error(`Phone verification has expired. Please re-verify your phone to continue with ${paymentLabel}.`);
          error.code = 'PHONE_EXPIRED';
          throw error;
        }

        const networkName = getNetworkNameFromDisplayName(formData.network);
        const isEvmNetwork = ['base', 'ethereum', 'polygon', 'arbitrum', 'optimism', 'avalanche', 'linea', 'zksync'].includes(
          networkName.toLowerCase()
        );

        let destinationAddress = formData.address;

        if (isEvmNetwork) {
          const smartAccount = currentUser?.evmSmartAccounts?.[0] as string;

          if (!smartAccount) {
            throw new Error('Your wallet is still getting ready. Try again in a moment.');
          }

          destinationAddress = smartAccount;
        }

        const result = await createGuestCheckoutOrder({
          paymentAmount: formData.amount,
          paymentCurrency: formData.paymentCurrency,
          purchaseCurrency: getAssetSymbolFromName(formData.asset),
          paymentMethod: paymentMethodValue,
          destinationNetwork: networkName,
          destinationAddress,
          email: userEmail || 'noemail@test.com',
          phoneNumber: phone,
          phoneNumberVerifiedAt: new Date(phoneAt!).toISOString(),
          partnerUserRef,
          agreementAcceptedAt: new Date().toISOString(),
          isQuote: false,
        });

        if (!result.hostedUrl) {
          throw new Error('No payment URL received');
        }

        setHostedUrl(result.hostedUrl);
        setActivePaymentMethod(paymentMethodValue);
        setGuestCheckoutVisible(true);
      } catch (error: any) {
        if (error?.code !== 'MISSING_EMAIL' && error?.code !== 'MISSING_PHONE') {
          console.error('API Error:', error);
        }

        setIsProcessingPayment(false);
        throw error;
      }
    },
    [currentUser, getAssetSymbolFromName, getNetworkNameFromDisplayName, linkedEmail, linkedPhone, regentsUserId]
  );

  const createWidgetSession = useCallback(
    async (formData: OnrampFormData) => {
      setIsProcessingPayment(true);

      try {
        const assetSymbol = getAssetSymbolFromName(formData.asset);
        const networkName = getNetworkNameFromDisplayName(formData.network);
        const country = getCountry();
        let subdivision = getSubdivision();

        if (country === 'US' && !subdivision) {
          subdivision = 'CA';
          setSubdivision('CA');
        }

        const partnerUserRef = regentsUserId || 'unknown-user';
        setCurrentPartnerUserRef(partnerUserRef);
        await registerTransactionPushToken(partnerUserRef);

        const isEvmNetwork = ['base', 'ethereum', 'polygon', 'arbitrum', 'optimism', 'avalanche', 'linea', 'zksync'].includes(
          networkName.toLowerCase()
        );
        const isSolanaNetwork = networkName.toLowerCase().includes('solana');

        let destinationAddress = formData.address;

        if (isEvmNetwork) {
          const smartAccount = currentUser?.evmSmartAccounts?.[0] as string;

          if (!smartAccount) {
            throw new Error('Your wallet is still getting ready. Try again in a moment.');
          }

          destinationAddress = smartAccount;
        } else if (isSolanaNetwork) {
          const solanaAddress = currentUser?.solanaAccounts?.[0] as string;

          if (!solanaAddress) {
            throw new Error('Your Solana wallet is still getting ready. Try again in a moment.');
          }

          destinationAddress = solanaAddress;
        }

        const response = await createOnrampSession({
          purchaseCurrency: assetSymbol,
          destinationNetwork: networkName,
          destinationAddress,
          paymentAmount: formData.amount,
          paymentCurrency: formData.paymentCurrency,
          country,
          subdivision,
        });

        let url = response?.session?.onrampUrl;

        if (url) {
          const separator = url.includes('?') ? '&' : '?';
          url = `${url}${separator}partnerUserId=${encodeURIComponent(partnerUserRef)}`;
        }

        if (!url) {
          throw new Error('No onrampUrl returned');
        }

        return url;
      } finally {
        setIsProcessingPayment(false);
      }
    },
    [currentUser, getAssetSymbolFromName, getNetworkNameFromDisplayName, regentsUserId]
  );

  const closeGuestCheckout = useCallback(() => {
    setGuestCheckoutVisible(false);
    setActivePaymentMethod(null);
    setHostedUrl('');
    setIsProcessingPayment(false);
    setTransactionStatus(null);
  }, []);

  return {
    guestCheckoutVisible,
    activePaymentMethod,
    hostedUrl,
    transactionStatus,
    isProcessingPayment,
    createOrder,
    createWidgetSession,
    closeGuestCheckout,
    setTransactionStatus,
    setIsProcessingPayment,
  };
}
