import { sendOnrampProxyRequest } from './network/onrampProxy';

export interface UserLimit {
  limitType: "weekly_spending" | "lifetime_transactions";
  currency?: string;
  limit: string;
  remaining: string;
}

export interface UserLimitsResponse {
  limits: UserLimit[];
}

export async function fetchUserLimits(
  phoneNumber: string,
  accessToken?: string
): Promise<UserLimitsResponse> {
  const responseJson = await sendOnrampProxyRequest<UserLimitsResponse>({
    context: 'fetchUserLimits',
    method: 'POST',
    url: 'https://api.cdp.coinbase.com/platform/v2/onramp/limits',
    authToken: accessToken,
    body: {
      paymentMethodType: 'GUEST_CHECKOUT_APPLE_PAY',
      userId: phoneNumber,
      userIdType: 'phone_number',
    },
  });

  return {
    limits: responseJson.limits || [],
  };
}
