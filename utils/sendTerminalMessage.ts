import { getBaseUrl } from '@/constants/BASE_URL';
import { TerminalSessionDetail } from '@/types/terminal';
import { authenticatedFetch } from './authenticatedFetch';

export async function sendTerminalMessage(sessionId: string, text: string): Promise<TerminalSessionDetail> {
  const response = await authenticatedFetch(`${getBaseUrl()}/terminal/sessions/${encodeURIComponent(sessionId)}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.message || 'Unable to send that message right now.');
  }

  const payload = await response.json();
  return payload.session;
}
