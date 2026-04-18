import { getBaseUrl } from '@/constants/BASE_URL';
import { TerminalSessionDetail } from '@/types/terminal';
import { authenticatedFetch } from './authenticatedFetch';

export async function resolveTerminalApproval(
  sessionId: string,
  requestId: string,
  decision: 'approved' | 'denied'
): Promise<TerminalSessionDetail> {
  const response = await authenticatedFetch(
    `${getBaseUrl()}/terminal/sessions/${encodeURIComponent(sessionId)}/approvals/${encodeURIComponent(requestId)}`,
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
    throw new Error(payload?.message || 'Unable to resolve that approval right now.');
  }

  const payload = await response.json();
  return payload.session;
}
