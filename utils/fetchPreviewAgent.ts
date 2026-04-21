import { getBaseUrl } from '@/constants/BASE_URL';
import { PreviewAgentDetail } from '@/types/agentPreviews';
import { authenticatedFetch } from './authenticatedFetch';

export async function fetchPreviewAgent(agentId: string): Promise<PreviewAgentDetail> {
  const response = await authenticatedFetch(`${getBaseUrl()}/mobile-preview/agents/${encodeURIComponent(agentId)}`);
  if (!response.ok) {
    throw new Error('Unable to load this preview card right now.');
  }

  return response.json();
}
