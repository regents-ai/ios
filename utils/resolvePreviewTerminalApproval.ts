import { getBaseUrl } from '@/constants/BASE_URL';
import { PreviewTerminalSessionDetail } from '@/types/terminalPreviews';
import { authenticatedFetch } from './authenticatedFetch';

export async function resolvePreviewTerminalApproval(
  sessionId: string,
  requestId: string,
  decision: 'approved' | 'denied'
): Promise<PreviewTerminalSessionDetail> {
  const response = await authenticatedFetch(
    `${getBaseUrl()}/mobile-preview/terminal/sessions/${encodeURIComponent(sessionId)}/approvals/${encodeURIComponent(requestId)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ decision }),
    }
  );

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.message || 'Unable to update this preview step right now.');
  }

  const payload = await response.json();
  return payload.session;
}
