import { getBaseUrl } from '@/constants/BASE_URL';
import { PreviewTerminalSessionDetail } from '@/types/terminalPreviews';
import { authenticatedFetch } from './authenticatedFetch';

const CURRENT_TALK_SESSIONS_PATH = '/mobile-preview/terminal/sessions';
const talkSessionPath = (sessionId: string) => `${CURRENT_TALK_SESSIONS_PATH}/${encodeURIComponent(sessionId)}`;

export async function fetchPreviewTerminalSession(sessionId: string): Promise<PreviewTerminalSessionDetail> {
  const response = await authenticatedFetch(`${getBaseUrl()}${talkSessionPath(sessionId)}`);
  if (!response.ok) {
    throw new Error('Unable to load this conversation right now.');
  }

  const payload: { session: PreviewTerminalSessionDetail } = await response.json();
  return payload.session;
}
