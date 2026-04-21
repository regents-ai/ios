import { getBaseUrl } from '@/constants/BASE_URL';
import { PreviewTerminalSessionSummary } from '@/types/terminalPreviews';
import { authenticatedFetch } from './authenticatedFetch';

export async function fetchPreviewTerminalSessions(): Promise<PreviewTerminalSessionSummary[]> {
  const response = await authenticatedFetch(`${getBaseUrl()}/mobile-preview/terminal/sessions`);
  if (!response.ok) {
    throw new Error('Unable to load the preview sessions right now.');
  }

  const payload = await response.json();
  return payload.sessions || [];
}
