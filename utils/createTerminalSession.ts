import { getBaseUrl } from '@/constants/BASE_URL';
import { TerminalSessionDetail } from '@/types/terminal';
import { authenticatedFetch } from './authenticatedFetch';

export async function createTerminalSession(input: {
  agentId: string;
  agentName: string;
}): Promise<TerminalSessionDetail> {
  const response = await authenticatedFetch(`${getBaseUrl()}/terminal/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.message || 'Unable to start a terminal session right now.');
  }

  const payload = await response.json();
  return payload.session;
}
