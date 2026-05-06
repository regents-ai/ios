import { sendOnrampProxyRequest } from './network/onrampProxy';

export async function fetchBuyOptions(payload: any) {
  return sendOnrampProxyRequest({
    context: 'fetchBuyOptions',
    operation: 'buy_options',
    params: payload,
  });
}
