import { getBaseUrl } from '@/constants/BASE_URL';
import { PreviewAgentDetail } from '@/types/agentPreviews';
import { authenticatedFetch } from './authenticatedFetch';

const CURRENT_AGENTS_PATH = '/mobile-preview/agents';
const agentPath = (agentId: string) => `${CURRENT_AGENTS_PATH}/${encodeURIComponent(agentId)}`;

export async function fetchPreviewAgent(agentId: string): Promise<PreviewAgentDetail> {
  const response = await authenticatedFetch(`${getBaseUrl()}${agentPath(agentId)}`);
  if (!response.ok) {
    throw new Error('Unable to load this agent right now.');
  }

  const agent: PreviewAgentDetail = await response.json();
  return agent;
}
