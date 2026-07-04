import type { NotificationResponse } from 'expo-notifications';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { setPendingRoute } from '@/utils/pendingRoute';
import { routeIntentFromNotificationData } from '@/utils/pushNotificationRouting';
import { requestWalletRefresh } from '@/utils/walletRefresh';

async function getNotificationsModule() {
  if (Platform.OS === 'web') {
    return null;
  }

  return import('expo-notifications');
}

function responseKey(response: NotificationResponse) {
  const identifier = response.notification.request.identifier;
  if (identifier) {
    return identifier;
  }

  const data = response.notification.request.content.data;
  if (typeof data?.threadId === 'string') {
    return data.threadId;
  }
  return typeof data?.transactionId === 'string' ? data.transactionId : null;
}

export function PushNotificationRouter() {
  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }

    let active = true;
    let subscription: { remove(): void } | undefined;

    const handleResponse = (response: NotificationResponse | null | undefined) => {
      if (!response) {
        return;
      }

      const intent = routeIntentFromNotificationData(response.notification.request.content.data);
      if (!intent) {
        return;
      }

      // Write into the shared pending-route store; the root drains it once
      // navigation is ready (dedupe by the notification key lives in the store).
      const key = responseKey(response) ?? `notif-${Date.now()}`;
      setPendingRoute({ key, href: intent.href });
      if (intent.refreshWallet) {
        requestWalletRefresh(key);
      }
    };

    getNotificationsModule()
      .then(async (Notifications) => {
        if (!active || !Notifications) {
          return;
        }

        subscription = Notifications.addNotificationResponseReceivedListener(handleResponse);
        const lastResponse = await Notifications.getLastNotificationResponseAsync();
        if (active) {
          handleResponse(lastResponse);
        }
      })
      .catch((error) => {
        console.error('[PUSH] Failed to connect push notification routing:', error);
      });

    return () => {
      active = false;
      subscription?.remove();
    };
  }, []);

  return null;
}
