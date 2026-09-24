/** The one asset and network the app buys: USDC on Base. */
export const PURCHASE_ASSET = 'USDC';
export const PURCHASE_NETWORK = 'base';

/** One purchase of USDC on Base, delivered to `address`. */
export type OnrampFormData = {
  amount: string;
  address: string;
  paymentMethod: string;
  paymentCurrency: string;
  phoneNumber?: string;
  agreementAcceptedAt: string;
};

export type PaymentMethodOption = {
  display: string;
  value: string;
};
