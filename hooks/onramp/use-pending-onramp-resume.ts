import { useCallback } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';

import type { OnrampFormData } from '@/components/onramp/onramp-form-types';
import { openCoinbaseWidgetSession } from '@/utils/onramp/openCoinbaseWidgetSession';
import {
  clearPendingForm,
  getPendingForm,
} from '@/utils/state/flowRuntimeState';
import { getVerifiedPhone, isPhoneFresh60d } from '@/utils/state/verificationState';
import { getWalletAddressForNetwork } from '@/utils/state/walletRuntimeState';
import { userFacingMessage } from '@/utils/userFacingError';

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
  const router = useRouter();
  const resolvePendingAddress = useCallback(
    (networkApiName: string, fallbackAddress: string) => {
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
              await openCoinbaseWidgetSession({
                router,
                url,
                partnerUserRef: currentUser?.userId,
              });
              clearPendingForm();
            }
            return;
          }

          if (!effectiveIsSignedIn) {
            return;
          }

          const phoneFresh = isPhoneFresh60d();
          const verifiedPhone = getVerifiedPhone();

          if (!phoneFresh || !verifiedPhone) {
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
          console.error('Pending purchase resume failed:', error);
          showSupportError(
            "Purchase didn't go through",
            userFacingMessage(error, "We couldn't finish your purchase. Please try again."),
            'Transaction failed during pending form resumption'
          );
        }
      };

      void handlePendingForm();
    }, [
      createOrder,
      createWidgetSession,
      effectiveIsSignedIn,
      currentUser?.userId,
      getAssetSymbolFromName,
      getNetworkNameFromDisplayName,
      onTransactionPrepared,
      resolvePendingAddress,
      router,
      setAlertState,
      showSupportError,
    ])
  );
}
