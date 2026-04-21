import { getBaseUrl } from '@/constants/BASE_URL';
import { PreviewAgentSummary } from '@/types/agentPreviews';
import { authenticatedFetch } from './authenticatedFetch';

export async function fetchPreviewAgents(): Promise<PreviewAgentSummary[]> {
  const response = await authenticatedFetch(`${getBaseUrl()}/mobile-preview/agents`);
  if (!response.ok) {
    throw new Error('Unable to load the preview agents right now.');
  }

  const payload = await response.json();
  return payload.agents || [];
}
