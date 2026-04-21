import { useCallback } from 'react';
import { Linking } from 'react-native';
import { useFocusEffect } from 'expo-router';

import type { OnrampFormData } from '@/components/onramp/onramp-form-types';
import {
  clearPendingForm,
  getPendingForm,
} from '@/utils/state/flowRuntimeState';
import { getSandboxMode } from '@/utils/state/sandboxState';
import { getVerifiedPhone, isPhoneFresh60d } from '@/utils/state/verificationState';
import { getWalletAddressForNetwork } from '@/utils/state/walletRuntimeState';

type Params = {
  createOrder: (formData: OnrampFormData) => Promise<void>;
  createWidgetSession: (formData: OnrampFormData) => Promise<string | undefined>;
  currentUser: any;
  effectiveIsSignedIn: boolean;
  evmAddress?: string | null;
  getAssetSymbolFromName: (assetName: string) => string;
  getNetworkNameFromDisplayName: (displayName: string) => string;
  onTransactionPrepared: (formData: OnrampFormData) => void;
  setAlertState: (state: any) => void;
  showSupportError: (title: string, errorMessage: string, debugMessage: string) => void;
  solanaAddress?: string | null;
};

export function usePendingOnrampResume({
  createOrder,
  createWidgetSession,
  currentUser,
  effectiveIsSignedIn,
  evmAddress,
  getAssetSymbolFromName,
  getNetworkNameFromDisplayName,
  onTransactionPrepared,
  setAlertState,
  showSupportError,
  solanaAddress,
}: Params) {
  const resolvePendingAddress = useCallback(
    (networkApiName: string, fallbackAddress: string) => {
      if (getSandboxMode()) {
        return fallbackAddress;
      }

      return getWalletAddressForNetwork(networkApiName) ?? fallbackAddress;
    },
    []
  );

  useFocusEffect(
    useCallback(() => {
      const pendingForm = getPendingForm();
      if (!pendingForm) {
        return;
      }

      const handlePendingForm = async () => {
        try {
          if ((pendingForm.paymentMethod || '').toUpperCase() === 'COINBASE_WIDGET') {
            const url = await createWidgetSession(pendingForm);
            if (url) {
              Linking.openURL(url);
              clearPendingForm();
            }
            return;
          }

          if (!effectiveIsSignedIn) {
            return;
          }

          const isSandbox = getSandboxMode();
          const phoneFresh = isPhoneFresh60d();
          const verifiedPhone = getVerifiedPhone();

          if (!isSandbox && (!phoneFresh || !verifiedPhone)) {
            return;
          }

          const networkApiName = getNetworkNameFromDisplayName(pendingForm.network);
          const assetApiName = getAssetSymbolFromName(pendingForm.asset);
          const updatedFormData = {
            ...pendingForm,
            network: networkApiName,
            asset: assetApiName,
            phoneNumber: verifiedPhone || pendingForm.phoneNumber,
            address: resolvePendingAddress(networkApiName, pendingForm.address),
          };

          onTransactionPrepared(updatedFormData);
          await createOrder(updatedFormData);
          clearPendingForm();
        } catch (error) {
          clearPendingForm();
          const errorMessage = error instanceof Error ? error.message : 'Unable to create transaction. Please try again.';
          setAlertState({
            visible: true,
            title: 'Transaction Failed',
            message: `${errorMessage}\n\nContact support for help.`,
            type: 'error',
          });
          showSupportError('Transaction Failed', errorMessage, 'Transaction failed during pending form resumption');
        }
      };

      void handlePendingForm();
    }, [
      createOrder,
      createWidgetSession,
      effectiveIsSignedIn,
      getAssetSymbolFromName,
      getNetworkNameFromDisplayName,
      onTransactionPrepared,
      resolvePendingAddress,
      setAlertState,
      showSupportError,
    ])
  );
}
