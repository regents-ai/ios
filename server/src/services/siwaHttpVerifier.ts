/**
 * Verifies a SIWA-signed agent request with the SIWA server.
 *
 * The agent signs its HTTP request for the `regents-mobile` audience; the
 * backend forwards method, path, the host the request reached, headers and,
 * for a request with a body, the content digest of the bytes it received
 * (never the body itself) to `POST {SIWA_SERVER_URL}/api/shared/siwa/http-verify`,
 * which checks the receipt, the signature over the covered components, that
 * the signed host is one of this audience's own, that the signed content
 * digest is this one, and replay state, and answers with the verified wallet
 * principal.
 *
 * The answer is read the way Keyfleet reads it: only a Base (8453) wallet
 * principal for this audience whose address matches the request's own
 * wallet header is accepted. A replay is told apart from a rejection, and a
 * SIWA server that is down, slow or erroring is "unavailable", never
 * "rejected".
 */

export const SIWA_AUDIENCE = 'regents-mobile';
export const BASE_CHAIN_ID = 8453;
export const SIWA_VERIFY_TIMEOUT_MS = 5000;

/** A read carries no body, so it is sent without a digest and signs no content digest. */
export type SignedAgentRequest = {
  method: string;
  path: string;
  authority: string;
  headers: Record<string, string>;
  body_digest?: string;
};

export type SiwaVerification =
  | { kind: 'verified'; walletAddress: string }
  | { kind: 'rejected'; status: number }
  | { kind: 'replayed' }
  | { kind: 'unavailable'; reason: string }
  | { kind: 'missing_config'; requiredEnv: 'SIWA_SERVER_URL' };

export type SignedAgentRequestVerifier = (request: SignedAgentRequest) => Promise<SiwaVerification>;

function siwaServerUrl() {
  return process.env.SIWA_SERVER_URL?.trim().replace(/\/+$/, '') || '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function verifiedWalletAddress(payload: unknown, requestWalletHeader: string | undefined): string | null {
  if (!isRecord(payload) || !isRecord(payload.data)) {
    return null;
  }
  const { data } = payload;
  if (data.verified !== true || data.chainId !== BASE_CHAIN_ID || !isRecord(data.principal)) {
    return null;
  }
  const { kind, wallet_address: walletAddress, chain_id: chainId, audience } = data.principal;
  if (
    kind !== 'wallet' ||
    chainId !== BASE_CHAIN_ID ||
    audience !== SIWA_AUDIENCE ||
    typeof walletAddress !== 'string' ||
    !/^0x[a-fA-F0-9]{40}$/.test(walletAddress) ||
    data.walletAddress !== walletAddress ||
    typeof requestWalletHeader !== 'string' ||
    requestWalletHeader.toLowerCase() !== walletAddress.toLowerCase()
  ) {
    return null;
  }
  return walletAddress;
}

export async function verifySignedAgentRequest(
  request: SignedAgentRequest,
  options?: { siwaServerUrl?: string; fetchImpl?: typeof fetch; timeoutMs?: number },
): Promise<SiwaVerification> {
  const baseUrl = (options?.siwaServerUrl ?? siwaServerUrl()).replace(/\/+$/, '');
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
      signal: AbortSignal.timeout(options?.timeoutMs ?? SIWA_VERIFY_TIMEOUT_MS),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    return { kind: 'unavailable', reason: name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'unreachable' };
  }

  if (response.status >= 500) {
    return { kind: 'unavailable', reason: `status_${response.status}` };
  }
  if (response.status === 409) {
    return { kind: 'replayed' };
  }
  if (!response.ok) {
    return { kind: 'rejected', status: response.status };
  }

  const walletAddress = verifiedWalletAddress(
    await response.json().catch(() => null),
    request.headers['x-agent-wallet-address'],
  );
  return walletAddress ? { kind: 'verified', walletAddress } : { kind: 'rejected', status: response.status };
}
