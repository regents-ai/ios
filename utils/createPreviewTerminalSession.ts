import { getBaseUrl } from '@/constants/BASE_URL';
import { PreviewTerminalSessionDetail } from '@/types/terminalPreviews';
import { authenticatedFetch } from './authenticatedFetch';

export async function createPreviewTerminalSession(input: {
  agentId: string;
  agentName: string;
}): Promise<PreviewTerminalSessionDetail> {
  const response = await authenticatedFetch(`${getBaseUrl()}/mobile-preview/terminal/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.message || 'Unable to open this preview session right now.');
  }

  const payload = await response.json();
  return payload.session;
}
