import type { Href } from 'expo-router';

import { routes } from './navigation/routes';

const threadIdPattern = /^[1-9][0-9]*(~[1-9][0-9]*){0,2}$/;

const onrampNotificationTypes = new Set(['onramp_complete', 'onramp_failed']);

export function isMessageThreadId(value: unknown): value is string {
  return typeof value === 'string' && threadIdPattern.test(value);
}

export type PushRouteIntent = {
  href: Href;
  /** True when the notification reports wallet activity, so balances should refresh. */
  refreshWallet: boolean;
};

export function routeIntentFromNotificationData(data: unknown): PushRouteIntent | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const payload = data as Record<string, unknown>;

  if (payload.type === 'mobile_message' && isMessageThreadId(payload.threadId)) {
    return { href: routes.messageThread(payload.threadId), refreshWallet: false };
  }

  if (typeof payload.type === 'string' && onrampNotificationTypes.has(payload.type)) {
    return { href: routes.wallet(), refreshWallet: true };
  }

  return null;
}
