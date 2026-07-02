import type { Href } from 'expo-router';

import { routes } from './navigation/routes';

const threadIdPattern = /^[1-9][0-9]*(~[1-9][0-9]*){0,2}$/;

export function isMessageThreadId(value: unknown): value is string {
  return typeof value === 'string' && threadIdPattern.test(value);
}

export function messageThreadRouteFromNotificationData(data: unknown): Href | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const payload = data as Record<string, unknown>;
  if (payload.type !== 'mobile_message' || !isMessageThreadId(payload.threadId)) {
    return null;
  }

  return routes.messageThread(payload.threadId);
}
