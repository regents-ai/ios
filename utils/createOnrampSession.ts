import { sendOnrampProxyRequest } from './network/onrampProxy';

export async function createOnrampSession(payload: any) {
  console.log('📤 [API] createOnrampSession');

  return sendOnrampProxyRequest({
    context: 'createOnrampSession',
    method: 'POST',
    url: 'https://api.cdp.coinbase.com/platform/v2/onramp/sessions',
    body: payload,
  });
}
