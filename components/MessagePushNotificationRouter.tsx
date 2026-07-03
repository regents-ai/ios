import type { NotificationResponse } from 'expo-notifications';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { setPendingRoute } from '@/utils/pendingRoute';
import { messageThreadRouteFromNotificationData } from '@/utils/pushNotificationRouting';

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
  return typeof data?.threadId === 'string' ? data.threadId : null;
}

export function MessagePushNotificationRouter() {
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

      const route = messageThreadRouteFromNotificationData(response.notification.request.content.data);
      if (!route) {
        return;
      }

      // Write into the shared pending-route store; the root drains it once
      // navigation is ready (dedupe by the notification key lives in the store).
      const key = responseKey(response);
      setPendingRoute({ key: key ?? `notif-${Date.now()}`, href: route });
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
        console.error('[PUSH] Failed to connect message notification routing:', error);
      });

    return () => {
      active = false;
      subscription?.remove();
    };
  }, []);

  return null;
}
