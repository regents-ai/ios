import { getBaseUrl } from '@/constants/BASE_URL';
import { PreviewAgentWithdrawal } from '@/types/agentPreviews';
import { authenticatedFetch } from './authenticatedFetch';

const CURRENT_AGENTS_PATH = '/mobile-preview/agents';
const withdrawalPath = (agentId: string) => `${CURRENT_AGENTS_PATH}/${encodeURIComponent(agentId)}/withdrawals`;

export async function createPreviewAgentWithdrawal(input: {
  agentId: string;
  amount: string;
  currency: string;
  destinationWalletAddress: string;
  idempotencyKey: string;
}): Promise<PreviewAgentWithdrawal> {
  const response = await authenticatedFetch(`${getBaseUrl()}${withdrawalPath(input.agentId)}`, {
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
    throw new Error(payload?.message || 'Unable to start this transfer right now.');
  }

  const payload: { withdrawal: PreviewAgentWithdrawal } = await response.json();
  return payload.withdrawal;
}
