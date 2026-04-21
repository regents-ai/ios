import { getBaseUrl } from '@/constants/BASE_URL';
import { PreviewAgentWithdrawal } from '@/types/agentPreviews';
import { authenticatedFetch } from './authenticatedFetch';

export async function createPreviewAgentWithdrawal(input: {
  agentId: string;
  amount: string;
  currency: string;
  destinationWalletAddress: string;
  idempotencyKey: string;
}): Promise<PreviewAgentWithdrawal> {
  const response = await authenticatedFetch(`${getBaseUrl()}/mobile-preview/agents/${encodeURIComponent(input.agentId)}/withdrawals`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': input.idempotencyKey,
    },
    body: JSON.stringify({
      amount: input.amount,
      currency: input.currency,
      destinationWalletAddress: input.destinationWalletAddress,
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.message || 'Unable to load that preview step right now.');
  }

  const payload = await response.json();
  return payload.withdrawal;
}
