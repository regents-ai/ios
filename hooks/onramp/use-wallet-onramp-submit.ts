import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';

import { useRegentsAuth } from '@/hooks/useRegentsAuth';
import type { OnrampFormData } from '@/components/onramp/onramp-form-types';
import {
  clearPendingForm,
  setPendingForm,
} from '@/utils/state/flowRuntimeState';
import { getVerifiedPhone } from '@/utils/state/verificationState';
import { getWalletAddressForNetwork } from '@/utils/state/walletRuntimeState';
import {
  createGuestCheckoutDebugInfo,
  openSupportEmail,
  SUPPORT_EMAIL,
} from '@/utils/supportEmail';

type AlertState = {
  visible: boolean;
  title: string;
  message: string;
  type: 'success' | 'error' | 'info';
  navigationPath?: string;
  onConfirmCallback?: () => Promise<void> | void;
  onCancelCallback?: () => void;
  confirmText?: string;
  cancelText?: string;
};

type Params = {
  createOrder: (formData: OnrampFormData) => Promise<void>;
  createWidgetSession: (formData: OnrampFormData) => Promise<string | undefined>;
  currentUser: any;
  evmAddress?: string | null;
  getAssetSymbolFromName: (assetName: string) => string;
  getNetworkNameFromDisplayName: (displayName: string) => string;
  setIsProcessingPayment: (value: boolean) => void;
  signOutIdentity: () => Promise<void>;
  signOutWallet: () => Promise<void>;
  solanaAddress?: string | null;
};

export function useWalletOnrampSubmit({
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
}: Params) {
  const router = useRouter();
  const { linkedPhone } = useRegentsAuth();
  const [currentTransaction, setCurrentTransaction] = useState<{
    amount: string;
    paymentCurrency: string;
    asset: string;
    network: string;
  } | null>(null);
  const [alertState, setAlertState] = useState<AlertState>({
    visible: false,
    title: '',
    message: '',
    type: 'info',
  });

  const resetAlertState = useCallback(() => {
    setAlertState({
      visible: false,
      title: '',
      message: '',
      type: 'info',
      navigationPath: undefined,
      onConfirmCallback: undefined,
      onCancelCallback: undefined,
      confirmText: undefined,
      cancelText: undefined,
    });
  }, []);

  const clearTransaction = useCallback(() => {
    setCurrentTransaction(null);
  }, []);

  const showSupportError = useCallback(
    (title: string, errorMessage: string, debugMessage: string) => {
      setAlertState({
        visible: true,
        title,
        message: `${errorMessage}\n\nContact ${SUPPORT_EMAIL} for support. We'll resolve the issue within 1 business day.`,
        type: 'error',
        confirmText: 'Email Support',
        onConfirmCallback: async () => {
          const debugInfo = createGuestCheckoutDebugInfo({
            asset: currentTransaction?.asset,
            network: currentTransaction?.network,
            amount: currentTransaction?.amount,
            currency: currentTransaction?.paymentCurrency,
            errorMessage,
            debugMessage,
          });
          await openSupportEmail(debugInfo);
        },
        onCancelCallback: () => {},
      });
    },
    [currentTransaction]
  );

  const resolveTargetAddress = useCallback(
    (networkApiName: string, fallbackAddress: string) => {
      return getWalletAddressForNetwork(networkApiName) ?? fallbackAddress;
    },
    []
  );

  const handleSubmit = useCallback(
    async (formData: OnrampFormData) => {
      setIsProcessingPayment(true);

      const networkApiName = getNetworkNameFromDisplayName(formData.network);
      const assetApiName = getAssetSymbolFromName(formData.asset);
      const updatedFormData = {
        ...formData,
        network: networkApiName,
        asset: assetApiName,
        address: resolveTargetAddress(networkApiName, formData.address),
      };

      try {
        setCurrentTransaction({
          amount: updatedFormData.amount,
          paymentCurrency: updatedFormData.paymentCurrency || 'USD',
          asset: assetApiName,
          network: networkApiName,
        });

        if ((formData.paymentMethod || '').toUpperCase() === 'COINBASE_WIDGET') {
          const url = await createWidgetSession(updatedFormData);
          if (url) {
            const { Linking } = await import('react-native');
            Linking.openURL(url);
          }
          return;
        }

        await createOrder(updatedFormData);
      } catch (error: any) {
        const isGooglePay = formData.paymentMethod === 'GUEST_CHECKOUT_GOOGLE_PAY';
        const paymentLabel = isGooglePay ? 'Google Pay' : 'Apple Pay';

        if (error.code === 'MISSING_EMAIL') {
          setPendingForm(updatedFormData);
          setAlertState({
            visible: true,
            title: `Link Email for ${paymentLabel}`,
            message: `${paymentLabel} requires both email and phone verification for compliance.\n\nWould you like to link your email to this account to continue?`,
            type: 'info',
            navigationPath: '/email-verify?mode=link',
          });
          return;
        }

        if (error.code === 'MISSING_PHONE') {
          setPendingForm(updatedFormData);
          const cdpPhone = linkedPhone;

          if (cdpPhone) {
            const isUSPhone = cdpPhone.startsWith('+1');
            const disclaimer = isUSPhone
              ? ''
              : `\n\nNote: ${paymentLabel} is only available for US phone numbers. You can use this flow to experience the verification process.`;

            setAlertState({
              visible: true,
              title: `Re-verify Phone for ${paymentLabel}`,
              message: `Your phone is linked but needs verification.\n\nTo verify, we need to sign you out and send a verification code to your phone.\n\nWould you like to continue?${disclaimer}`,
              type: 'info',
              onConfirmCallback: async () => {
                try {
                  await signOutIdentity();
                  await signOutWallet();
                  await new Promise(resolve => setTimeout(resolve, 500));

                  router.replace({
                    pathname: '/phone-verify',
                    params: {
                      initialPhone: cdpPhone,
                      mode: 'signin',
                      autoSend: 'true',
                    },
                  });
                } catch (signOutError: any) {
                  setAlertState({
                    visible: true,
                    title: 'Error',
                    message: signOutError.message || 'Failed to start verification. Please try again.',
                    type: 'error',
                  });
                }
              },
              onCancelCallback: () => {
                clearPendingForm();
                setIsProcessingPayment(false);
              },
            });
          } else {
            setAlertState({
              visible: true,
              title: `Link Phone for ${paymentLabel}`,
              message: `${paymentLabel} requires both email and phone verification for compliance.\n\nWould you like to link your phone to this account to continue?`,
              type: 'info',
              navigationPath: '/phone-verify?mode=link',
            });
          }
          return;
        }

        if (error.code === 'PHONE_EXPIRED') {
          setPendingForm(updatedFormData);
          const expiredPhone = getVerifiedPhone();
          const isUSPhone = expiredPhone?.startsWith('+1');
          const disclaimer = isUSPhone
            ? ''
            : `\n\nNote: ${paymentLabel} is only available for US phone numbers. You can use this flow to experience the verification process.`;

          setAlertState({
            visible: true,
            title: 'Re-verify Phone for Apple Pay',
            message: `Your phone verification has expired (valid for 60 days).\n\nTo re-verify, we need to sign you out and send a new verification code to your phone.\n\nWould you like to continue?${disclaimer}`,
            type: 'info',
            onConfirmCallback: async () => {
              try {
                await signOutIdentity();
                await signOutWallet();
                await new Promise(resolve => setTimeout(resolve, 500));

                router.replace({
                  pathname: '/phone-verify',
                  params: {
                    initialPhone: expiredPhone,
                    mode: 'signin',
                    autoSend: 'true',
                  },
                });
              } catch (signOutError: any) {
                setAlertState({
                  visible: true,
                  title: 'Error',
                  message: signOutError.message || 'Failed to start re-verification. Please try again.',
                  type: 'error',
                });
              }
            },
            onCancelCallback: () => {
              clearPendingForm();
              setIsProcessingPayment(false);
            },
          });
          return;
        }

        if (error.code === 'NON_US_PHONE') {
          clearPendingForm();
          setAlertState({
            visible: true,
            title: 'US Phone Required',
            message: `${paymentLabel} is available with US phone numbers. Use More payment options or add a US phone number to continue.`,
            type: 'info',
          });
          setIsProcessingPayment(false);
          return;
        }

        const errorMessage = error instanceof Error ? error.message : 'Unable to create transaction. Please try again.';
        showSupportError('Transaction Failed', errorMessage, 'Transaction failed during submission');
        console.error('Error submitting form:', error);
        setIsProcessingPayment(false);
      }
    },
    [
      createOrder,
      createWidgetSession,
      getAssetSymbolFromName,
      getNetworkNameFromDisplayName,
      linkedPhone,
      resolveTargetAddress,
      router,
      setIsProcessingPayment,
      showSupportError,
      signOutIdentity,
      signOutWallet,
    ]
  );

  const handleAlertConfirm = useCallback(async () => {
    const navigationPath = alertState.navigationPath;
    const callback = alertState.onConfirmCallback;
    resetAlertState();
    clearTransaction();

    if (callback) {
      await callback();
      return;
    }

    if (navigationPath) {
      router.push(navigationPath as any);
    }
  }, [alertState.navigationPath, alertState.onConfirmCallback, clearTransaction, resetAlertState, router]);

  const handleAlertCancel = useMemo(() => {
    if (!alertState.onCancelCallback) {
      return undefined;
    }

    return () => {
      const callback = alertState.onCancelCallback;
      resetAlertState();
      clearTransaction();
      callback?.();
    };
  }, [alertState.onCancelCallback, clearTransaction, resetAlertState]);

  return {
    alertState,
    currentTransaction,
    handleAlertCancel,
    handleAlertConfirm,
    handleSubmit,
    resetAlertState,
    setAlertState,
    setCurrentTransaction,
    showSupportError,
  };
}
