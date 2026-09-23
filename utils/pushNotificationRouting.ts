import type { Href } from 'expo-router';

import { routes } from './navigation/routes';

const walletActivityNotificationTypes = new Set([
  'onramp_complete',
  'onramp_failed',
  'offramp_complete',
  'offramp_failed',
]);

/** The notification category the server sends payment requests in, with its Pay and Decline buttons. */
export const PAYMENT_REQUEST_CATEGORY = 'payment_request';
export const PAYMENT_REQUEST_ACTIONS = { pay: 'pay', decline: 'decline' } as const;

export type PushRouteIntent = {
  href: Href;
  /** True when the notification reports wallet activity, so balances should refresh. */
  refreshWallet: boolean;
  /** True when a notification button asked the app to act, so the response must not replay on a later launch. */
  startsAction: boolean;
};

export function routeIntentFromNotificationResponse(data: unknown, actionIdentifier: string): PushRouteIntent | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const payload = data as Record<string, unknown>;

  if (typeof payload.type === 'string' && walletActivityNotificationTypes.has(payload.type)) {
    return { href: routes.wallet(), refreshWallet: true, startsAction: false };
  }

  if (payload.type === PAYMENT_REQUEST_CATEGORY && typeof payload.requestId === 'string' && payload.requestId !== '') {
    switch (actionIdentifier) {
      case PAYMENT_REQUEST_ACTIONS.pay:
        return { href: routes.paymentRequest(payload.requestId, 'pay'), refreshWallet: false, startsAction: true };
      case PAYMENT_REQUEST_ACTIONS.decline:
        return { href: routes.paymentRequest(payload.requestId, 'decline'), refreshWallet: false, startsAction: true };
      default:
        return { href: routes.paymentRequest(payload.requestId), refreshWallet: false, startsAction: false };
    }
  }

  return null;
}
