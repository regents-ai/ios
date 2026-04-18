import { getBaseUrl } from '@/constants/BASE_URL';
import { TerminalSessionDetail } from '@/types/terminal';
import { authenticatedFetch } from './authenticatedFetch';

export async function fetchTerminalSession(sessionId: string): Promise<TerminalSessionDetail> {
  const response = await authenticatedFetch(`${getBaseUrl()}/terminal/sessions/${encodeURIComponent(sessionId)}`);
  if (!response.ok) {
    throw new Error('Unable to load this session right now.');
  }

  const payload = await response.json();
  return payload.session;
}
