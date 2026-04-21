import { getBaseUrl } from '@/constants/BASE_URL';
import { PreviewTerminalEvent } from '@/types/terminalPreviews';
import { authenticatedFetch } from './authenticatedFetch';

export async function fetchPreviewTerminalEvents(sessionId: string): Promise<PreviewTerminalEvent[]> {
  const response = await authenticatedFetch(`${getBaseUrl()}/mobile-preview/terminal/sessions/${encodeURIComponent(sessionId)}/events`);
  if (!response.ok) {
    throw new Error('Unable to load the latest preview updates.');
  }

  const payload = await response.json();
  return payload.events || [];
}
