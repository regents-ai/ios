import { getBaseUrl } from '@/constants/BASE_URL';
import { PreviewTerminalEvent } from '@/types/terminalPreviews';
import { authenticatedFetch } from './authenticatedFetch';

const CURRENT_TALK_SESSIONS_PATH = '/mobile-preview/terminal/sessions';
const talkEventsPath = (sessionId: string) => `${CURRENT_TALK_SESSIONS_PATH}/${encodeURIComponent(sessionId)}/events`;

export async function fetchPreviewTerminalEvents(sessionId: string): Promise<PreviewTerminalEvent[]> {
  const response = await authenticatedFetch(`${getBaseUrl()}${talkEventsPath(sessionId)}`);
  if (!response.ok) {
    throw new Error('Unable to load the latest updates right now.');
  }

  const payload: { events: PreviewTerminalEvent[] } = await response.json();
  return payload.events;
}
