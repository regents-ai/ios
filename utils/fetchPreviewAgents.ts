import { getBaseUrl } from '@/constants/BASE_URL';
import { PreviewAgentSummary } from '@/types/agentPreviews';
import { authenticatedFetch } from './authenticatedFetch';

const CURRENT_AGENTS_PATH = '/mobile-preview/agents';

export async function fetchPreviewAgents(): Promise<PreviewAgentSummary[]> {
  const response = await authenticatedFetch(`${getBaseUrl()}${CURRENT_AGENTS_PATH}`);
  if (!response.ok) {
    throw new Error('Unable to load agents right now.');
  }

  const payload: { agents: PreviewAgentSummary[] } = await response.json();
  return payload.agents;
}
