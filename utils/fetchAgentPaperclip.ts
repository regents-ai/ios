import { getBaseUrl } from '@/constants/BASE_URL';
import { PaperclipDetail } from '@/types/agents';
import { authenticatedFetch } from './authenticatedFetch';

export async function fetchAgentPaperclip(agentId: string): Promise<PaperclipDetail> {
  const response = await authenticatedFetch(`${getBaseUrl()}/mobile/agents/${encodeURIComponent(agentId)}/paperclip`);
  if (!response.ok) {
    throw new Error('Unable to load this Paperclip view right now.');
  }

  return response.json();
}
