import { getBaseUrl } from '@/constants/BASE_URL';
import { PreviewTerminalSessionSummary } from '@/types/terminalPreviews';
import { authenticatedFetch } from './authenticatedFetch';

const TALK_SESSIONS_PATH = '/mobile-preview/terminal/sessions';

export async function fetchPreviewTerminalSessions(): Promise<PreviewTerminalSessionSummary[]> {
  const response = await authenticatedFetch(`${getBaseUrl()}${TALK_SESSIONS_PATH}`);
  if (!response.ok) {
    throw new Error('Unable to load conversations right now.');
  }

  const payload: { sessions: PreviewTerminalSessionSummary[] } = await response.json();
  return payload.sessions;
}
