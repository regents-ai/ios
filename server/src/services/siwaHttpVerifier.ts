/**
 * Verifies a SIWA-signed agent request with the SIWA server.
 *
 * The agent signs its HTTP request for the `regents-mobile` audience; the
 * backend forwards method, path, headers and, for a request with a body, the
 * content digest of the bytes it received (never the body itself) to
 * `POST {SIWA_SERVER_URL}/api/shared/siwa/http-verify` with this server's own
 * verify key (`SIWA_SITE_VERIFY_KEY`) as `Authorization: Bearer`. The key names
 * the audience the SIWA server checks the request for. It checks the receipt,
 * the signature over the covered components, that the signed content digest is
 * this one, and replay state, and answers with the verified wallet principal.
 *
 * The answer is read the way Keyfleet reads it: only a Base (8453) wallet
 * principal for this audience whose address matches the request's own
 * wallet header is accepted. A replay is told apart from a rejection, and a
 * SIWA server that is down, slow or erroring is "unavailable", never
 * "rejected". A refused verify key, or a verdict for another audience, means
 * this server's own settings are wrong, never the agent's request.
 */

export const SIWA_AUDIENCE = 'regents-mobile';
export const BASE_CHAIN_ID = 8453;
export const SIWA_VERIFY_TIMEOUT_MS = 5000;

/** A read carries no body, so it is sent without a digest and signs no content digest. */
export type SignedAgentRequest = {
  method: string;
  path: string;
  headers: Record<string, string>;
  body_digest?: string;
};

export type SiwaVerification =
  | { kind: 'verified'; walletAddress: string }
  | { kind: 'rejected'; status: number }
  | { kind: 'replayed' }
  | { kind: 'unavailable'; reason: string }
  | { kind: 'site_problem'; problem: 'verify_key_refused' | 'audience_mismatch' }
  | { kind: 'missing_config'; requiredEnv: 'SIWA_SERVER_URL' | 'SIWA_SITE_VERIFY_KEY' };

export type SignedAgentRequestVerifier = (request: SignedAgentRequest) => Promise<SiwaVerification>;

function siwaServerUrl() {
  return process.env.SIWA_SERVER_URL?.trim().replace(/\/+$/, '') || '';
}

function siteVerifyKey() {
  return process.env.SIWA_SITE_VERIFY_KEY?.trim() || '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function errorCode(payload: unknown): unknown {
  return isRecord(payload) && isRecord(payload.error) ? payload.error.code : undefined;
}

function verdict(payload: unknown, requestWalletHeader: string | undefined, status: number): SiwaVerification {
  if (!isRecord(payload) || !isRecord(payload.data)) {
    return { kind: 'rejected', status };
  }
  const { data } = payload;
  if (data.verified !== true || data.chainId !== BASE_CHAIN_ID || !isRecord(data.principal)) {
    return { kind: 'rejected', status };
  }
  const { kind, wallet_address: walletAddress, chain_id: chainId, audience } = data.principal;
  if (typeof audience === 'string' && audience !== SIWA_AUDIENCE) {
    return { kind: 'site_problem', problem: 'audience_mismatch' };
  }
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
    return { kind: 'rejected', status };
  }
  return { kind: 'verified', walletAddress };
}

export async function verifySignedAgentRequest(
  request: SignedAgentRequest,
  options?: { siwaServerUrl?: string; verifyKey?: string; fetchImpl?: typeof fetch; timeoutMs?: number },
): Promise<SiwaVerification> {
  const baseUrl = (options?.siwaServerUrl ?? siwaServerUrl()).replace(/\/+$/, '');
  if (!baseUrl) {
    return { kind: 'missing_config', requiredEnv: 'SIWA_SERVER_URL' };
  }
  const verifyKey = options?.verifyKey ?? siteVerifyKey();
  if (!verifyKey) {
    return { kind: 'missing_config', requiredEnv: 'SIWA_SITE_VERIFY_KEY' };
  }

  const fetchImpl = options?.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl}/api/shared/siwa/http-verify`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${verifyKey}`,
        'content-type': 'application/json',
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
  const payload = await response.json().catch(() => null);
  if (response.status === 401 && errorCode(payload) === 'site_verify_unauthorized') {
    return { kind: 'site_problem', problem: 'verify_key_refused' };
  }
  if (!response.ok) {
    return { kind: 'rejected', status: response.status };
  }
  return verdict(payload, request.headers['x-agent-wallet-address'], response.status);
}
