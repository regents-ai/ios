import type { Request, Response } from 'express';
import type { z } from 'zod';

import { sendError } from '../httpResponses.js';
import type { SignedAgentRequestVerifier } from '../services/siwaHttpVerifier.js';
import contract from '../siwa/contract.json' with { type: 'json' };

/**
 * The agent side of the phone backend: every `/agent/*` request is a
 * SIWA-signed HTTP request, checked here the same way before a route acts on
 * it. The headers are checked first, then the body (for requests that carry
 * one), then the SIWA server verifies the signature and answers with the
 * agent's Base wallet.
 *
 * The header names come from the SIWA signing contract, a generated copy of
 * elixir-utils' `siwa/contract/contract.json` (`npm run siwa:contract`).
 */

// The headers a SIWA-signed request carries, each at most once. Only these
// reach the SIWA server, so no other header can steer the check, and routes
// act only on the wallet it verifies. A request without a body signs no
// content digest.
const PROOF_HEADERS: readonly string[] = contract.forwarded_headers;
const BODYLESS_PROOF_HEADERS = PROOF_HEADERS.filter((name) => name !== contract.body.component);

const PROOF_HEADERS_MESSAGE =
  'The signed request headers are not in the expected shape. Sign the request again and resend it.';
const QUERY_MESSAGE = 'Signed requests here carry no query string. Sign the request without one and resend it.';

/** The proof headers the request carries; Express lowercases header names. */
function forwardedHeaders(req: Request) {
  const headers: Record<string, string> = {};
  for (const name of PROOF_HEADERS) {
    const value = req.headers[name];
    if (typeof value === 'string') {
      headers[name] = value;
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

/**
 * Why the proof headers cannot be checked, as the contract and the template name
 * it, or null when every required one is present once and none is repeated.
 */
function proofHeadersProblem(req: Request, required: readonly string[]) {
  const counts = req.headersDistinct;
  if (PROOF_HEADERS.some((name) => (counts[name]?.length ?? 0) > 1)) {
    return 'duplicate_proof';
  }
  if (!required.every((name) => counts[name]?.length === 1)) {
    return 'http_headers_missing';
  }
  return null;
}

/** Answers a signed request this backend refuses before asking the SIWA server. */
function refuseUnchecked(req: Request, res: Response, required: readonly string[]) {
  if (hasQuery(req)) {
    sendError(res, 401, 'unsupported_query', QUERY_MESSAGE);
    return true;
  }
  const problem = proofHeadersProblem(req, required);
  if (problem !== null) {
    sendError(res, 401, problem, PROOF_HEADERS_MESSAGE);
    return true;
  }
  return false;
}

/** The signed path is the path alone; this backend signs no query string. */
function hasQuery(req: Request) {
  return (req.originalUrl || req.url).includes('?');
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
  if (refuseUnchecked(req, res, PROOF_HEADERS)) {
    return null;
  }
  if (!isJsonContentType(req.headers['content-type'])) {
    sendError(res, 415, 'UnsupportedMediaType', input.notJsonMessage);
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
 * A signed read. It is verified with no body; a body sent anyway goes to the
 * SIWA server with it, which refuses one the signature does not cover.
 * Returns the verified wallet, or null once answered.
 */
export async function readSignedAgentRead(
  req: Request,
  res: Response,
  input: { verify: SignedAgentRequestVerifier; unavailableMessage: string },
): Promise<string | null> {
  if (refuseUnchecked(req, res, BODYLESS_PROOF_HEADERS)) {
    return null;
  }
  const body = rawBody(req);
  return verifiedWallet(req, res, body === '' ? null : body, input);
}
