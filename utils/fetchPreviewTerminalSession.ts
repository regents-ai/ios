import { getBaseUrl } from '@/constants/BASE_URL';
import { PreviewTerminalSessionDetail } from '@/types/terminalPreviews';
import { authenticatedFetch } from './authenticatedFetch';

export async function fetchPreviewTerminalSession(sessionId: string): Promise<PreviewTerminalSessionDetail> {
  const response = await authenticatedFetch(`${getBaseUrl()}/mobile-preview/terminal/sessions/${encodeURIComponent(sessionId)}`);
  if (!response.ok) {
    throw new Error('Unable to load this preview session right now.');
  }

  const payload = await response.json();
  return payload.session;
}
