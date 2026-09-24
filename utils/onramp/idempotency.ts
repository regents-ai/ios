type OnrampIdempotencyKind = 'order' | 'session';

const IDEMPOTENCY_FIELDS = [
  'partnerUserRef',
  'destinationNetwork',
  'destinationAddress',
  'paymentAmount',
  'purchaseAmount',
  'paymentCurrency',
  'purchaseCurrency',
  'paymentMethod',
  'isQuote',
  'redirectUrl',
] as const;

/** Amount segments carry their kind, so paying $25 and buying 25 USDC never share a key. */
const SEGMENT_LABELS: Partial<Record<typeof IDEMPOTENCY_FIELDS[number], string>> = {
  paymentAmount: 'pay',
  purchaseAmount: 'buy',
};

function readSegment(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
    return null;
  }

  const normalized = String(value).trim().toLowerCase();
  return normalized ? encodeURIComponent(normalized).slice(0, 120) : null;
}

export function buildOnrampIdempotencyKey(
  kind: OnrampIdempotencyKind,
  payload: Record<string, unknown>,
  operationId: string
) {
  const operationSegment = readSegment(operationId);
  if (!operationSegment) {
    throw new Error('This purchase cannot be started right now.');
  }

  const segments = IDEMPOTENCY_FIELDS
    .map((field) => {
      const segment = readSegment(payload[field]);
      const label = SEGMENT_LABELS[field];
      return segment && label ? `${label}-${segment}` : segment;
    })
    .filter((segment): segment is string => !!segment);

  return ['regents-mobile', 'onramp', kind, operationSegment, ...segments].join(':');
}
