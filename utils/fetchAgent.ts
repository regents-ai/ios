import { getBaseUrl } from '@/constants/BASE_URL';
import { AgentDetail } from '@/types/agents';
import { authenticatedFetch } from './authenticatedFetch';

export async function fetchAgent(agentId: string): Promise<AgentDetail> {
  const response = await authenticatedFetch(`${getBaseUrl()}/mobile/agents/${encodeURIComponent(agentId)}`);
  if (!response.ok) {
    throw new Error('Unable to load this agent right now.');
  }

  return response.json();
}
