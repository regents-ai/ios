import { useCallback } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';

import type { OnrampFormData } from '@/components/onramp/onramp-form-types';
import { openCoinbaseWidgetSession } from '@/utils/onramp/openCoinbaseWidgetSession';
import {
  clearPendingForm,
  getPendingForm,
} from '@/utils/state/flowRuntimeState';
import { getVerifiedPhone, isPhoneFresh60d } from '@/utils/state/verificationState';
import { userFacingMessage } from '@/utils/userFacingError';

type Params = {
  createOrder: (formData: OnrampFormData) => Promise<void>;
  createWidgetSession: (formData: OnrampFormData) => Promise<string | undefined>;
  currentUser: any;
  effectiveIsSignedIn: boolean;
  onTransactionPrepared: (formData: OnrampFormData) => void;
  setAlertState: (state: any) => void;
  showSupportError: (title: string, errorMessage: string, debugMessage: string) => void;
};

export function usePendingOnrampResume({
  createOrder,
  createWidgetSession,
  currentUser,
  effectiveIsSignedIn,
  onTransactionPrepared,
  setAlertState,
  showSupportError,
}: Params) {
  const router = useRouter();

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

          const updatedFormData = {
            ...pendingForm,
            phoneNumber: verifiedPhone,
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
      onTransactionPrepared,
      router,
      setAlertState,
      showSupportError,
    ])
  );
}
