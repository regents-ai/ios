import { getBaseUrl } from '@/constants/BASE_URL';
import { TerminalEvent } from '@/types/terminal';
import { authenticatedFetch } from './authenticatedFetch';

export async function fetchTerminalEvents(sessionId: string): Promise<TerminalEvent[]> {
  const response = await authenticatedFetch(`${getBaseUrl()}/terminal/sessions/${encodeURIComponent(sessionId)}/events`);
  if (!response.ok) {
    throw new Error('Unable to load the latest session events.');
  }

  const payload = await response.json();
  return payload.events || [];
}
