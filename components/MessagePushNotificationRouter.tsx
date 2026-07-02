import { useRouter } from 'expo-router';
import type { NotificationResponse } from 'expo-notifications';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

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
  const router = useRouter();
  const handledResponses = useRef(new Set<string>());

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

      const key = responseKey(response);
      if (key) {
        if (handledResponses.current.has(key)) {
          return;
        }
        handledResponses.current.add(key);
      }

      router.push(route);
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
  }, [router]);

  return null;
}
