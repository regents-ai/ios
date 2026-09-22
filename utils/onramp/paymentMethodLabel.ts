const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CARD: 'Card',
  ACH_BANK_ACCOUNT: 'Bank transfer',
  APPLE_PAY: 'Apple Pay',
  GOOGLE_PAY: 'Google Pay',
  PAYPAL: 'PayPal',
  FIAT_WALLET: 'Coinbase balance',
  CRYPTO_ACCOUNT: 'Coinbase balance',
};

/** Turns a payment method id such as ACH_BANK_ACCOUNT into words for the screen. */
export function paymentMethodLabel(id: string) {
  const known = PAYMENT_METHOD_LABELS[id.toUpperCase()];
  if (known) return known;
  const words = id.toLowerCase().split('_').filter(Boolean);
  return words.map((word, index) => (index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word)).join(' ');
}
