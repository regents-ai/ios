import { sendOnrampProxyRequest } from './network/onrampProxy';

type CreateOnrampSessionResponse = {
  session?: {
    onrampUrl?: string;
  };
};

export async function createOnrampSession(payload: any): Promise<CreateOnrampSessionResponse> {
  console.log('📤 [API] createOnrampSession');

  return sendOnrampProxyRequest<CreateOnrampSessionResponse>({
    context: 'createOnrampSession',
    method: 'POST',
    url: 'https://api.cdp.coinbase.com/platform/v2/onramp/sessions',
    body: payload,
  });
}
