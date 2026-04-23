import { getBaseUrl } from '@/constants/BASE_URL';
import { PreviewRegentManagerDetail } from '@/types/agentPreviews';
import { authenticatedFetch } from './authenticatedFetch';

const CURRENT_AGENTS_PATH = '/mobile-preview/agents';
const regentManagerPath = (agentId: string) => `${CURRENT_AGENTS_PATH}/${encodeURIComponent(agentId)}/regent-manager`;

export async function fetchPreviewRegentManager(agentId: string): Promise<PreviewRegentManagerDetail> {
  const response = await authenticatedFetch(`${getBaseUrl()}${regentManagerPath(agentId)}`);
  if (!response.ok) {
    throw new Error('Unable to load this company summary right now.');
  }

  const regentManager: PreviewRegentManagerDetail = await response.json();
  return regentManager;
}
