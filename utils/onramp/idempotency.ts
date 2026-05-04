type OnrampIdempotencyKind = 'order' | 'session';

const IDEMPOTENCY_FIELDS = [
  'partnerUserRef',
  'destinationNetwork',
  'destinationAddress',
  'paymentAmount',
  'paymentCurrency',
  'purchaseCurrency',
  'paymentMethod',
  'isQuote',
  'redirectUrl',
] as const;

function readSegment(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
    return null;
  }

  const normalized = String(value).trim().toLowerCase();
  return normalized ? encodeURIComponent(normalized).slice(0, 120) : null;
}

export function buildOnrampIdempotencyKey(kind: OnrampIdempotencyKind, payload: Record<string, unknown>) {
  const segments = IDEMPOTENCY_FIELDS
    .map((field) => readSegment(payload[field]))
    .filter((segment): segment is string => !!segment);

  return ['regents-mobile', 'onramp', kind, ...segments].join(':');
}
