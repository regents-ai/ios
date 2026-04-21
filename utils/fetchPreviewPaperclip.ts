import { getBaseUrl } from '@/constants/BASE_URL';
import { PreviewPaperclipDetail } from '@/types/agentPreviews';
import { authenticatedFetch } from './authenticatedFetch';

export async function fetchPreviewPaperclip(agentId: string): Promise<PreviewPaperclipDetail> {
  const response = await authenticatedFetch(`${getBaseUrl()}/mobile-preview/agents/${encodeURIComponent(agentId)}/paperclip`);
  if (!response.ok) {
    throw new Error('Unable to load this preview summary right now.');
  }

  return response.json();
}
