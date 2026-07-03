import { getBaseUrl } from '@/constants/BASE_URL';

import { sendOnrampProxyRequest } from './network/onrampProxy';
import { getCachedCatalogRequest } from './onramp/buyCatalogCache';

export async function fetchBuyConfig() {
  // The buy config is catalog metadata; cache it briefly by resource URL so
  // repeated form mounts do not double-fetch the same payload.
  return getCachedCatalogRequest(`${getBaseUrl()}/server/api?operation=buy_config`, () =>
    sendOnrampProxyRequest({
      context: 'fetchBuyConfig',
      operation: 'buy_config',
    })
  );
}
