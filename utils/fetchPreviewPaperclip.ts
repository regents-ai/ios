import { getBaseUrl } from '@/constants/BASE_URL';
import { PreviewPaperclipDetail } from '@/types/agentPreviews';
import { authenticatedFetch } from './authenticatedFetch';

const CURRENT_AGENTS_PATH = '/mobile-preview/agents';
const paperclipPath = (agentId: string) => `${CURRENT_AGENTS_PATH}/${encodeURIComponent(agentId)}/paperclip`;

export async function fetchPreviewPaperclip(agentId: string): Promise<PreviewPaperclipDetail> {
  const response = await authenticatedFetch(`${getBaseUrl()}${paperclipPath(agentId)}`);
  if (!response.ok) {
    throw new Error('Unable to load this company summary right now.');
  }

  const paperclip: PreviewPaperclipDetail = await response.json();
  return paperclip;
}
