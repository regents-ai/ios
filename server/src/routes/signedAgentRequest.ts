import type { Request, Response } from 'express';
import type { z } from 'zod';

import { sendError } from '../httpResponses.js';
import type { SignedAgentRequestVerifier } from '../services/siwaHttpVerifier.js';

/**
 * The agent side of the phone backend: every `/agent/*` request is a
 * SIWA-signed HTTP request, checked here the same way before a route acts on
 * it. The headers are checked first, then the body (for requests that carry
 * one), then the SIWA server verifies the signature and answers with the
 * agent's Base wallet.
 */

// The headers a SIWA-signed request carries, each exactly once. Any other
// x-agent-* or x-siwa-* header is refused: nothing outside the proof may
// steer the check. Mirrors Keyfleet's signed-agent plug. A request without a
// body signs no content digest.
const PROOF_HEADERS = [
  'signature',
  'signature-input',
  'content-digest',
  'x-siwa-receipt',
  'x-key-id',
  'x-timestamp',
  'x-agent-wallet-address',
  'x-agent-chain-id',
] as const;
const BODYLESS_PROOF_HEADERS = PROOF_HEADERS.filter((name) => name !== 'content-digest');

const PROOF_HEADERS_MESSAGE =
  'The signed request headers are not in the expected shape. Sign the request again and resend it.';

/** Express lowercases header names; multi-value headers join the way HTTP does. */
function forwardedHeaders(req: Request) {
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') {
      headers[name] = value;
    } else if (Array.isArray(value)) {
      headers[name] = value.join(', ');
    }
  }
  return headers;
}

function rawBody(req: Request) {
  return Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
}

function isJsonContentType(value: string | undefined) {
  return typeof value === 'string' && /^application\/json\s*(;.*)?$/i.test(value.trim());
}

/** Every required proof header present once, and no stray agent or SIWA headers. */
function hasWellFormedProofHeaders(req: Request, required: readonly string[]) {
  const counts = req.headersDistinct;
  const once = required.every((name) => counts[name]?.length === 1);
  const stray = Object.keys(counts).some(
    (name) =>
      (name.startsWith('x-agent-') || name.startsWith('x-siwa-')) && !(PROOF_HEADERS as readonly string[]).includes(name),
  );
  return once && !stray;
}

/** Answers the request itself and returns null unless the SIWA server verified the agent's wallet. */
async function verifiedWallet(
  req: Request,
  res: Response,
  body: string | null,
  input: { verify: SignedAgentRequestVerifier; unavailableMessage: string },
): Promise<string | null> {
  const verification = await input.verify({
    method: req.method,
    path: req.originalUrl || req.url,
    headers: forwardedHeaders(req),
    ...(body === null ? {} : { body }),
  });

  if (verification.kind === 'missing_config') {
    console.error(`❌ [AGENTS] ${verification.requiredEnv} is not set; signed agent requests are refused.`);
    sendError(res, 503, 'AgentRequestsUnavailable', input.unavailableMessage);
    return null;
  }
  if (verification.kind === 'unavailable') {
    console.warn('⚠️ [AGENTS] Sign-in service unavailable:', { reason: verification.reason });
    sendError(res, 503, 'SignInServiceBusy', 'Sign-in service is busy, try again.');
    return null;
  }
  if (verification.kind === 'replayed') {
    sendError(res, 409, 'SignedRequestReplayed', 'This signed request was already used. Send a fresh one.');
    return null;
  }
  if (verification.kind === 'rejected') {
    console.warn('⚠️ [AGENTS] Signed agent request rejected:', { status: verification.status });
    sendError(res, 401, 'SignedRequestRejected', 'This signed request was not accepted. Sign in again and retry with a fresh request.');
    return null;
  }
  return verification.walletAddress;
}

/**
 * A signed request with a JSON body. Returns the verified wallet and the
 * parsed body, or null once the request has been answered with the reason.
 */
export async function readSignedAgentJson<T>(
  req: Request,
  res: Response,
  input: {
    verify: SignedAgentRequestVerifier;
    schema: z.ZodType<T>;
    notJsonMessage: string;
    bodyMessage: string;
    unavailableMessage: string;
  },
): Promise<{ walletAddress: string; body: T } | null> {
  if (!isJsonContentType(req.headers['content-type'])) {
    sendError(res, 415, 'UnsupportedMediaType', input.notJsonMessage);
    return null;
  }
  if (!hasWellFormedProofHeaders(req, PROOF_HEADERS)) {
    sendError(res, 400, 'BadRequest', PROOF_HEADERS_MESSAGE);
    return null;
  }

  const body = rawBody(req);
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    sendError(res, 400, 'BadRequest', input.bodyMessage);
    return null;
  }
  const parsed = input.schema.safeParse(json);
  if (!parsed.success) {
    sendError(res, 400, 'BadRequest', input.bodyMessage);
    return null;
  }

  const walletAddress = await verifiedWallet(req, res, body, input);
  return walletAddress === null ? null : { walletAddress, body: parsed.data };
}

/**
 * A signed request without a body, verified with no body: the SIWA server
 * treats any body, even an empty one, as needing a content digest. Returns
 * the verified wallet, or null once answered.
 */
export async function readSignedAgentRead(
  req: Request,
  res: Response,
  input: { verify: SignedAgentRequestVerifier; unavailableMessage: string },
): Promise<string | null> {
  if (!hasWellFormedProofHeaders(req, BODYLESS_PROOF_HEADERS)) {
    sendError(res, 400, 'BadRequest', PROOF_HEADERS_MESSAGE);
    return null;
  }
  return verifiedWallet(req, res, null, input);
}
