import { sendOnrampProxyRequest } from './network/onrampProxy';

export async function fetchBuyOptions(payload: any) {
  const params = new URLSearchParams(payload);
  const url = `https://api.developer.coinbase.com/onramp/v1/buy/options?${params.toString()}`;

  return sendOnrampProxyRequest({
    context: 'fetchBuyOptions',
    method: 'GET',
    url,
  });
}
