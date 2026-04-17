import { BASE_URL } from '@/constants/BASE_URL';

export async function fetchCdpAuthToken(privyAccessToken: string): Promise<string | undefined> {
  const response = await fetch(`${BASE_URL}/auth/cdp-token`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${privyAccessToken}`,
    },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.message || 'Unable to open your wallet right now.');
  }

  const payload = await response.json();
  return payload.token;
}
