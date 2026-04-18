import { getBaseUrl } from '@/constants/BASE_URL';
import { AgentWithdrawal } from '@/types/agents';
import { authenticatedFetch } from './authenticatedFetch';

export async function createAgentWithdrawal(input: {
  agentId: string;
  amount: string;
  currency: string;
  destinationWalletAddress: string;
  idempotencyKey: string;
}): Promise<AgentWithdrawal> {
  const response = await authenticatedFetch(`${getBaseUrl()}/mobile/agents/${encodeURIComponent(input.agentId)}/withdrawals`, {
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
    throw new Error(payload?.message || 'Unable to request that withdrawal right now.');
  }

  const payload = await response.json();
  return payload.withdrawal;
}
