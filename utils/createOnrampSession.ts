import { sendOnrampProxyRequest } from './network/onrampProxy';
import { buildOnrampIdempotencyKey } from './onramp/idempotency';

type CreateOnrampSessionResponse = {
  session?: {
    onrampUrl?: string;
  };
};

export async function createOnrampSession(
  payload: any,
  operationId: string
): Promise<CreateOnrampSessionResponse> {
  console.log('📤 [API] createOnrampSession');

  return sendOnrampProxyRequest<CreateOnrampSessionResponse>({
    context: 'createOnrampSession',
    idempotencyKey: buildOnrampIdempotencyKey('session', payload, operationId),
    method: 'POST',
    url: 'https://api.cdp.coinbase.com/platform/v2/onramp/sessions',
    body: payload,
  });
}
