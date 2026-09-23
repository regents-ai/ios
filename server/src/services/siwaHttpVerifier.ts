/**
 * Verifies a SIWA-signed agent request with the SIWA server.
 *
 * The agent signs its HTTP request for the `regents-mobile` audience; the
 * backend forwards method, path, headers and raw body to
 * `POST {SIWA_SERVER_URL}/api/shared/siwa/http-verify`, which checks the
 * receipt, the signature over the covered components, the content digest and
 * replay state, and answers with the verified wallet principal.
 */

export const SIWA_AUDIENCE = 'regents-mobile';

export type SignedAgentRequest = {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: string;
};

export type SiwaVerification =
  | { kind: 'verified'; walletAddress: string }
  | { kind: 'rejected'; status: number }
  | { kind: 'missing_config'; requiredEnv: 'SIWA_SERVER_URL' }
  | { kind: 'unreachable' };

export type SignedAgentRequestVerifier = (request: SignedAgentRequest) => Promise<SiwaVerification>;

function siwaServerUrl() {
  return process.env.SIWA_SERVER_URL?.trim().replace(/\/+$/, '') || '';
}

function verifiedWalletAddress(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const data = (payload as { data?: unknown }).data;
  if (!data || typeof data !== 'object') {
    return null;
  }
  const { verified, principal } = data as { verified?: unknown; principal?: unknown };
  if (verified !== true || !principal || typeof principal !== 'object') {
    return null;
  }
  const { kind, wallet_address: walletAddress, audience } = principal as {
    kind?: unknown;
    wallet_address?: unknown;
    audience?: unknown;
  };
  if (kind !== 'wallet' || audience !== SIWA_AUDIENCE || typeof walletAddress !== 'string') {
    return null;
  }
  return /^0x[a-fA-F0-9]{40}$/.test(walletAddress) ? walletAddress : null;
}

export async function verifySignedAgentRequest(
  request: SignedAgentRequest,
  options?: { siwaServerUrl?: string; fetchImpl?: typeof fetch },
): Promise<SiwaVerification> {
  const baseUrl = options?.siwaServerUrl ?? siwaServerUrl();
  if (!baseUrl) {
    return { kind: 'missing_config', requiredEnv: 'SIWA_SERVER_URL' };
  }

  const fetchImpl = options?.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl}/api/shared/siwa/http-verify`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-siwa-audience': SIWA_AUDIENCE,
      },
      body: JSON.stringify(request),
    });
  } catch {
    return { kind: 'unreachable' };
  }

  if (!response.ok) {
    return { kind: 'rejected', status: response.status };
  }

  const walletAddress = verifiedWalletAddress(await response.json().catch(() => null));
  return walletAddress ? { kind: 'verified', walletAddress } : { kind: 'rejected', status: response.status };
}
