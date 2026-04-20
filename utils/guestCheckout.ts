type GuestCheckoutQuoteInput = {
  paymentCurrency: string;
  purchaseCurrency: string;
  paymentAmount: string;
  destinationNetwork: string;
  paymentMethod: string;
  partnerUserRef: string;
};

export function buildGuestCheckoutQuotePayload(
  payload: GuestCheckoutQuoteInput,
  destinationAddress: string
) {
  return {
    ...payload,
    isQuote: true,
    email: 'testquote@test.com',
    phoneNumber: '+12345678901',
    agreementAcceptedAt: new Date().toISOString(),
    phoneNumberVerifiedAt: new Date().toISOString(),
    destinationAddress,
  };
}

export function summarizeGuestCheckoutOrderLog(responseJson: Record<string, unknown>) {
  const keys = Object.keys(responseJson).sort();
  const paymentLink = responseJson.paymentLink as { url?: unknown } | undefined;
  const order = responseJson.order as { orderId?: unknown } | undefined;

  return {
    hasHostedUrl: typeof paymentLink?.url === 'string' && paymentLink.url.length > 0,
    hasOrderId: typeof order?.orderId === 'string' && order.orderId.length > 0,
    keyCount: keys.length,
    keys,
  };
}
