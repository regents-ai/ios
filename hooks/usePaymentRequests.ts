/**
 * The signed-in person's payment requests, shared by the Requests tab and its
 * badge. Every screen reads the same list; the newest load wins, and a
 * request that was paid or declined on its own screen is swapped in place.
 */

import type { PaymentRequest } from '@/types/regents';
import { createLatestRequestGate } from '@/utils/async/latestRequestGate';
import { describeApiError } from '@/utils/apiError';
import { waitingRequestCount, withUpdatedRequest } from '@/utils/paymentRequests/display';
import { PAYMENT_REQUEST_CATEGORY } from '@/utils/pushNotificationRouting';
import { regentApi } from '@/utils/regentApi/client';
import { useEffect, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';

export type PaymentRequestsState = {
  requests: PaymentRequest[];
  loaded: boolean;
  error: string | null;
};

let state: PaymentRequestsState = { requests: [], loaded: false, error: null };
const listeners = new Set<() => void>();
const gate = createLatestRequestGate();

function setState(next: PaymentRequestsState) {
  state = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function refreshPaymentRequests() {
  const requestId = gate.next();
  try {
    const { requests } = await regentApi.listPaymentRequests();
    if (gate.isLatest(requestId)) {
      setState({ requests, loaded: true, error: null });
    }
  } catch (error) {
    if (gate.isLatest(requestId)) {
      setState({ ...state, loaded: true, error: describeApiError(error).message });
    }
  }
}

export function showUpdatedPaymentRequest(request: PaymentRequest) {
  setState({ ...state, requests: withUpdatedRequest(state.requests, request) });
}

export function usePaymentRequests(): PaymentRequestsState {
  return useSyncExternalStore(subscribe, () => state);
}

/**
 * How many requests are waiting, for the tab badge. The list is read when the
 * tabs open, whenever the app comes back to the front, and when a payment
 * request arrives while the app is open.
 */
export function useWaitingRequestCount() {
  const { requests } = usePaymentRequests();

  useEffect(() => {
    let active = true;
    let received: { remove(): void } | undefined;

    void refreshPaymentRequests();
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        void refreshPaymentRequests();
      }
    });

    if (Platform.OS !== 'web') {
      import('expo-notifications')
        .then((Notifications) => {
          if (!active) {
            return;
          }
          received = Notifications.addNotificationReceivedListener((notification) => {
            if (notification.request.content.data?.type === PAYMENT_REQUEST_CATEGORY) {
              void refreshPaymentRequests();
            }
          });
        })
        .catch((error) => {
          console.error('[PUSH] Failed to follow new payment requests:', error);
        });
    }

    return () => {
      active = false;
      appState.remove();
      received?.remove();
    };
  }, []);

  return waitingRequestCount(requests);
}
