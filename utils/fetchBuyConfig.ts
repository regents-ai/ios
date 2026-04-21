import { sendOnrampProxyRequest } from './network/onrampProxy';

export async function fetchBuyConfig() {
  return sendOnrampProxyRequest({
    context: 'fetchBuyConfig',
    method: 'GET',
    url: 'https://api.developer.coinbase.com/onramp/v1/buy/config',
  });
}
