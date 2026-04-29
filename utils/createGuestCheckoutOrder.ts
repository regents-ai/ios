import { summarizeGuestCheckoutOrderLog } from './guestCheckout';
import { sendOnrampProxyRequest } from './network/onrampProxy';

/**
 * Pattern used across all API utilities:
 * 1. Enhanced request logging (method, headers, body preview)
 * 2. Response cloning for safe logging
 * 3. Proper error re-throwing for UI handling
 */

export async function createGuestCheckoutOrder(payload: any) {
  const method = payload.paymentMethod?.includes('GOOGLE') ? 'Google Pay' : 'Apple Pay';
  console.log(`📤 [API] createGuestCheckoutOrder (${method})`);

  const responseJson = await sendOnrampProxyRequest<any>({
    context: 'createGuestCheckoutOrder',
    method: 'POST',
    url: 'https://api.cdp.coinbase.com/platform/v2/onramp/orders',
    body: payload,
  });

  console.log('📦 [RESPONSE] Summary:', summarizeGuestCheckoutOrderLog(responseJson));

  return {
    ...responseJson,
    hostedUrl: responseJson.paymentLink?.url,
    orderId: responseJson.order?.orderId,
  };
}
