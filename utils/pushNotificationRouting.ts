import type { Href } from 'expo-router';

import { routes } from './navigation/routes';

const walletActivityNotificationTypes = new Set([
  'onramp_complete',
  'onramp_failed',
  'offramp_complete',
  'offramp_failed',
]);

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

  if (typeof payload.type === 'string' && walletActivityNotificationTypes.has(payload.type)) {
    return { href: routes.wallet(), refreshWallet: true };
  }

  return null;
}
