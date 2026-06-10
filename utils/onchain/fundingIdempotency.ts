/**
 * Idempotency key builder for tracked agent-funding wallet actions.
 *
 * The key pins the funding intent (agent, signer, destination, token, amount)
 * and appends a caller-supplied nonce so retries of the same tap are distinct.
 */

function fundingIdempotencySegment(value?: string | null) {
  const normalized = value?.trim().toLowerCase();
  return normalized ? encodeURIComponent(normalized).slice(0, 80) : 'missing';
}

export function buildFundingIdempotencyKey(input: {
  amount: string;
  expectedSigner: string;
  regentId: string;
  recipientAddress: string;
  tokenAddress?: string | null;
  nonce: string;
}) {
  return [
    'regents-mobile',
    'fund-agent',
    fundingIdempotencySegment(input.regentId),
    fundingIdempotencySegment(input.expectedSigner),
    fundingIdempotencySegment(input.recipientAddress),
    fundingIdempotencySegment(input.tokenAddress),
    fundingIdempotencySegment(input.amount),
    input.nonce,
  ].join(':');
}
