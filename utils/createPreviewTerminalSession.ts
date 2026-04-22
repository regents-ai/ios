import { getBaseUrl } from '@/constants/BASE_URL';
import { PreviewTerminalSessionDetail } from '@/types/terminalPreviews';
import { authenticatedFetch } from './authenticatedFetch';

const TALK_SESSIONS_PATH = '/mobile-preview/terminal/sessions';

export async function createPreviewTerminalSession(input: {
  agentId: string;
  agentName: string;
}): Promise<PreviewTerminalSessionDetail> {
  const response = await authenticatedFetch(`${getBaseUrl()}${TALK_SESSIONS_PATH}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.message || 'Unable to start this conversation right now.');
  }

  const payload: { session: PreviewTerminalSessionDetail } = await response.json();
  return payload.session;
}
