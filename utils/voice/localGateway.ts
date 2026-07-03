/**
 * Paired local Hermes voice gateway.
 *
 * A local (self-hosted) Hermes runs `regents voice serve`, which prints a QR
 * encoding `{ baseUrl, token }` (payload shape owned by the CLI contract
 * docs/shared-cli-contract.yaml). Scanning it pairs the phone with that local
 * gateway: `baseUrl` is the gateway's LAN URL, `token` is a REQUIRED bearer
 * that gates every /hermes/voice/* call and is NOT the OpenAI key.
 *
 * The pairing token is a secret: it is stored in the device keychain via the
 * hardened scoped secure store, never in plain storage, and never logged.
 */

import type { CreateHermesVoiceSessionRequest, HermesVoiceSession } from '@/types/regents';
import { ApiError, apiFailureKindForStatus } from '@/utils/apiError';

export type LocalVoiceGateway = {
  baseUrl: string;
  token: string;
};

/** Trims a trailing slash so `${baseUrl}/hermes/voice/...` never doubles up. */
function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

/**
 * Parses a scanned QR string into a paired gateway, or null if it is not a
 * valid `{ baseUrl, token }` payload. Only http(s) URLs are accepted, so a
 * stray QR can never point voice at a non-URL. Never logs the token.
 */
export function parsePairingPayload(raw: string): LocalVoiceGateway | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  const candidate = parsed as Record<string, unknown>;
  const { baseUrl, token } = candidate;
  if (typeof baseUrl !== 'string' || typeof token !== 'string' || !token.trim()) {
    return null;
  }

  if (!/^https?:\/\//i.test(baseUrl.trim())) {
    return null;
  }

  return { baseUrl: normalizeBaseUrl(baseUrl.trim()), token: token.trim() };
}

/** The session-mint URL for a paired local gateway. */
export function localSessionUrl(gateway: LocalVoiceGateway): string {
  return `${gateway.baseUrl}/hermes/voice/session`;
}

/** A non-secret label for the paired gateway (host only — never the token). */
export function gatewayDisplayLabel(gateway: LocalVoiceGateway): string {
  try {
    return new URL(gateway.baseUrl).host;
  } catch {
    return gateway.baseUrl;
  }
}

/**
 * Mints a voice session against the paired LOCAL gateway. Sends the pairing
 * token as `Authorization: Bearer <token>` and returns the SAME
 * HermesVoiceSession shape the hosted path returns, so the realtime client is
 * unchanged. Failures are classified into the humanized ApiError taxonomy: a
 * network drop (unreachable gateway) and a 401 (bad/expired token) get
 * what-to-do copy. The token is never logged or surfaced in an error.
 */
export async function createLocalHermesVoiceSession(input: {
  gateway: LocalVoiceGateway;
  session: CreateHermesVoiceSessionRequest;
}): Promise<HermesVoiceSession> {
  let response: Response;
  try {
    response = await fetch(localSessionUrl(input.gateway), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${input.gateway.token}`,
      },
      body: JSON.stringify(input.session),
    });
  } catch {
    // fetch rejects (TypeError) when the gateway is unreachable on the LAN.
    throw new ApiError(
      'network',
      'Could not reach your local Hermes. Make sure `regents voice serve` is running and your phone is on the same network.',
    );
  }

  if (!response.ok) {
    const kind = apiFailureKindForStatus(response.status);
    const message =
      response.status === 401
        ? 'This local Hermes rejected the pairing. Re-scan the QR from `regents voice serve` to pair again.'
        : 'Your local Hermes could not start voice right now.';
    throw new ApiError(kind, message, response.status);
  }

  return response.json() as Promise<HermesVoiceSession>;
}
