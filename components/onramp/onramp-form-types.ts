/** The one asset and network the app buys: USDC on Base. */
export const PURCHASE_ASSET = 'USDC';
export const PURCHASE_NETWORK = 'base';

/**
 * What the typed amount counts. `payment` is money paid, fees included.
 * `purchase` is USDC received, with fees added on top.
 */
export type AmountUnit = 'payment' | 'purchase';

/** The Coinbase amount field for this unit: exactly one of paymentAmount or purchaseAmount. */
export function amountField(amountUnit: AmountUnit, amount: string) {
  return amountUnit === 'purchase' ? { purchaseAmount: amount } : { paymentAmount: amount };
}

/** The parts of a purchase that name it. */
export type PurchaseRecord = Pick<OnrampFormData, 'amount' | 'amountUnit' | 'paymentCurrency'>;

/** A short line naming the purchase, for alerts and support emails. */
export function purchaseSummary({ amount, amountUnit, paymentCurrency }: PurchaseRecord) {
  return amountUnit === 'purchase'
    ? `${amount} ${PURCHASE_ASSET} on Base`
    : `${amount} ${paymentCurrency} for ${PURCHASE_ASSET} on Base`;
}

/** One purchase of USDC on Base, delivered to `address`. */
export type OnrampFormData = {
  amount: string;
  amountUnit: AmountUnit;
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
