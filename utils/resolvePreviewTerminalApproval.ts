import { getBaseUrl } from '@/constants/BASE_URL';
import { PreviewTerminalSessionDetail } from '@/types/terminalPreviews';
import { authenticatedFetch } from './authenticatedFetch';

const CURRENT_TALK_SESSIONS_PATH = '/mobile-preview/terminal/sessions';
const talkApprovalPath = (sessionId: string, requestId: string) =>
  `${CURRENT_TALK_SESSIONS_PATH}/${encodeURIComponent(sessionId)}/approvals/${encodeURIComponent(requestId)}`;

export async function resolvePreviewTerminalApproval(
  sessionId: string,
  requestId: string,
  decision: 'approved' | 'denied'
): Promise<PreviewTerminalSessionDetail> {
  const response = await authenticatedFetch(`${getBaseUrl()}${talkApprovalPath(sessionId, requestId)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ decision }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.message || 'Unable to save your decision right now.');
  }

  const payload: { session: PreviewTerminalSessionDetail } = await response.json();
  return payload.session;
}
