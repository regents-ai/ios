import { useCallback, useState } from 'react';

import { PURCHASE_ASSET, PURCHASE_NETWORK, type OnrampFormData } from '@/components/onramp/onramp-form-types';
import { createGuestCheckoutOrder } from '@/utils/createGuestCheckoutOrder';
import { createOnrampSession } from '@/utils/createOnrampSession';
import { getAccessTokenGlobal } from '@/utils/getAccessTokenGlobal';
import { coinbaseWidgetReturnUrl } from '@/utils/onramp/openCoinbaseWidgetSession';
import { registerForPushNotifications, sendPushTokenToServer } from '@/utils/pushNotifications';
import { getCountry, getSubdivision, setSubdivision } from '@/utils/state/locationState';
import { setCurrentPartnerUserRef } from '@/utils/state/flowRuntimeState';
import { getVerifiedPhone, getVerifiedPhoneAt, isPhoneFresh60d } from '@/utils/state/verificationState';
import { UserFacingError } from '@/utils/userFacingError';

type UseOnrampCheckoutArgs = {
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
  linkedEmail,
  linkedPhone,
  regentsUserId,
}: UseOnrampCheckoutArgs) {
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
          const error: any = new Error(`Phone verification required for ${paymentLabel}. Verify your phone in Settings.`);
          error.code = 'MISSING_PHONE';
          throw error;
        }

        if (!phone || !isPhoneFresh60d()) {
          const error: any = new Error(`Phone verification has expired. Please re-verify your phone to continue with ${paymentLabel}.`);
          error.code = 'PHONE_EXPIRED';
          throw error;
        }

        const result = await createGuestCheckoutOrder({
          paymentAmount: formData.amount,
          paymentCurrency: formData.paymentCurrency,
          purchaseCurrency: PURCHASE_ASSET,
          paymentMethod: paymentMethodValue,
          destinationNetwork: PURCHASE_NETWORK,
          destinationAddress: formData.address,
          email: userEmail || 'noemail@test.com',
          phoneNumber: phone,
          phoneNumberVerifiedAt: new Date(phoneAt!).toISOString(),
          partnerUserRef,
          agreementAcceptedAt: formData.agreementAcceptedAt,
          isQuote: false,
        });

        if (!result.hostedUrl) {
          throw new UserFacingError("We couldn't open checkout. Please try again.");
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
    [linkedEmail, linkedPhone, regentsUserId]
  );

  const createWidgetSession = useCallback(
    async (formData: OnrampFormData) => {
      setIsProcessingPayment(true);

      try {
        const country = getCountry();
        let subdivision = getSubdivision();

        if (country === 'US' && !subdivision) {
          subdivision = 'CA';
          setSubdivision('CA');
        }

        const partnerUserRef = regentsUserId || 'unknown-user';
        setCurrentPartnerUserRef(partnerUserRef);
        await registerTransactionPushToken(partnerUserRef);

        const response = await createOnrampSession(
          {
            purchaseCurrency: PURCHASE_ASSET,
            destinationNetwork: PURCHASE_NETWORK,
            destinationAddress: formData.address,
            paymentAmount: formData.amount,
            paymentCurrency: formData.paymentCurrency,
            country,
            subdivision,
            redirectUrl: `${coinbaseWidgetReturnUrl}?partnerUserRef=${encodeURIComponent(partnerUserRef)}`,
          },
          formData.agreementAcceptedAt,
          partnerUserRef
        );

        const url = response?.session?.onrampUrl;

        if (!url) {
          throw new UserFacingError("We couldn't open checkout. Please try again.");
        }

        return url;
      } finally {
        setIsProcessingPayment(false);
      }
    },
    [regentsUserId]
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
