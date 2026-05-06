import { sendOnrampProxyRequest } from './network/onrampProxy';

export async function fetchBuyConfig() {
  return sendOnrampProxyRequest({
    context: 'fetchBuyConfig',
    operation: 'buy_config',
  });
}
