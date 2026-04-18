import { getBaseUrl } from '@/constants/BASE_URL';
import { TerminalSessionSummary } from '@/types/terminal';
import { authenticatedFetch } from './authenticatedFetch';

export async function fetchTerminalSessions(): Promise<TerminalSessionSummary[]> {
  const response = await authenticatedFetch(`${getBaseUrl()}/terminal/sessions`);
  if (!response.ok) {
    throw new Error('Unable to load terminal sessions right now.');
  }

  const payload = await response.json();
  return payload.sessions || [];
}
