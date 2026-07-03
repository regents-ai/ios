import { getBaseUrl } from '@/constants/BASE_URL';

import { sendOnrampProxyRequest } from './network/onrampProxy';
import { getCachedCatalogRequest } from './onramp/buyCatalogCache';

function buildOptionsCacheUrl(payload: Record<string, unknown>) {
  const url = new URL(`${getBaseUrl()}/server/api`);
  url.searchParams.set('operation', 'buy_options');

  for (const key of Object.keys(payload).sort()) {
    const value = payload[key];
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

export async function fetchBuyOptions(payload: any) {
  // Buy options are catalog metadata (assets, networks, icon URLs); cache
  // them briefly per country/subdivision so repeated form mounts do not
  // double-fetch the same payload.
  return getCachedCatalogRequest(buildOptionsCacheUrl(payload ?? {}), () =>
    sendOnrampProxyRequest({
      context: 'fetchBuyOptions',
      operation: 'buy_options',
      params: payload,
    })
  );
}
