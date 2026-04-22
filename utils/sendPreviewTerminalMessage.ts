import { getBaseUrl } from '@/constants/BASE_URL';
import { PreviewTerminalSessionDetail } from '@/types/terminalPreviews';
import { authenticatedFetch } from './authenticatedFetch';

const CURRENT_TALK_SESSIONS_PATH = '/mobile-preview/terminal/sessions';
const talkMessagesPath = (sessionId: string) => `${CURRENT_TALK_SESSIONS_PATH}/${encodeURIComponent(sessionId)}/messages`;

export async function sendPreviewTerminalMessage(sessionId: string, text: string): Promise<PreviewTerminalSessionDetail> {
  const response = await authenticatedFetch(`${getBaseUrl()}${talkMessagesPath(sessionId)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.message || 'Unable to send your message right now.');
  }

  const payload: { session: PreviewTerminalSessionDetail } = await response.json();
  return payload.session;
}
