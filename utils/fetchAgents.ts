import { getBaseUrl } from '@/constants/BASE_URL';
import { AgentSummary } from '@/types/agents';
import { authenticatedFetch } from './authenticatedFetch';

export async function fetchAgents(): Promise<AgentSummary[]> {
  const response = await authenticatedFetch(`${getBaseUrl()}/mobile/agents`);
  if (!response.ok) {
    throw new Error('Unable to load your agents right now.');
  }

  const payload = await response.json();
  return payload.agents || [];
}
