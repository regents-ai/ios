import { Router, type Request, type Response } from 'express';
import type { Address } from 'viem';
import { z } from 'zod';

import { readBaseUsdcBalances, type BaseUsdcBalancesReader } from '../baseUsdcBalances.js';
import { sendError } from '../httpResponses.js';
import {
  addAgentForUser,
  agentKindSchema,
  agentNameSchema,
  confirmPairingForUser,
  createPairingCodeForUser,
  discardPairingCodeForUser,
  evmAddressSchema,
  listAgentsForUser,
  MAX_AGENTS_PER_USER,
  MobileAgentsStateError,
  pairingCodeStatusForUser,
  redeemPairingCode,
  removeAgentForUser,
  renameAgentForUser,
  type MobileAgentRecord,
  type MobileAgentsDeps,
  type MobileAgentsKv,
} from '../mobileAgents.js';
import {
  verifySignedAgentRequest,
  type SignedAgentRequestVerifier,
} from '../services/siwaHttpVerifier.js';

const addAgentBodySchema = z
  .object({
    name: agentNameSchema,
    kind: agentKindSchema,
    walletAddress: evmAddressSchema,
  })
  .strict();

const renameAgentBodySchema = z.object({ name: agentNameSchema }).strict();

const pairingCodeBodySchema = z
  .object({
    name: agentNameSchema,
    kind: agentKindSchema,
  })
  .strict();

const agentIdParamsSchema = z.object({ agent_id: z.string().min(1) });
const codeParamsSchema = z.object({ code: z.string().trim().min(1).max(20) });

const pairBodySchema = z.object({ code: z.string().trim().min(1) }).strict();

// The headers a SIWA-signed request carries, each exactly once. Any other
// x-agent-* or x-siwa-* header is refused: nothing outside the proof may
// steer the check. Mirrors KeyFleet's signed-agent plug.
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

const AGENT_LIMIT_MESSAGE = `You can keep up to ${MAX_AGENTS_PER_USER} agents. Remove one to add another.`;
const PAIR_BODY_MESSAGE = 'Send a JSON body with the pairing code, for example {"code":"ABCD-EFGH"}.';

function currentUserId(req: Request, res: Response) {
  if (req.userId) {
    return req.userId;
  }

  sendError(res, 401, 'Unauthorized', 'Sign in before managing your agents.');
  return null;
}

function agentJson(agent: MobileAgentRecord, usdcBalance: string | null) {
  return { ...agent, usdcBalance };
}

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

/** Every proof header present once, and no stray agent or SIWA headers. */
function hasWellFormedProofHeaders(req: Request) {
  const counts = req.headersDistinct;
  const once = PROOF_HEADERS.every((name) => counts[name]?.length === 1);
  const stray = Object.keys(counts).some(
    (name) =>
      (name.startsWith('x-agent-') || name.startsWith('x-siwa-')) && !(PROOF_HEADERS as readonly string[]).includes(name),
  );
  return once && !stray;
}

type Handler = (req: Request, res: Response) => Promise<unknown>;

/** A stored value that no longer parses fails that request loudly and is never overwritten. */
function guarded(handler: Handler): Handler {
  return async (req, res) => {
    try {
      return await handler(req, res);
    } catch (error) {
      if (error instanceof MobileAgentsStateError) {
        console.error('❌ [AGENTS] Stored state could not be read:', { key: error.key, issues: error.issues });
        return sendError(res, 500, 'AgentsUnavailable', "Your agents list couldn't be read right now. Please try again later.");
      }
      throw error;
    }
  };
}

export function createMobileAgentRoutes(input: {
  kv: MobileAgentsKv;
  now?: () => number;
  readUsdcBalances?: BaseUsdcBalancesReader;
  verifySignedRequest?: SignedAgentRequestVerifier;
}) {
  const router = Router();
  const deps: MobileAgentsDeps = { kv: input.kv };
  if (input.now) {
    deps.now = input.now;
  }
  const readUsdcBalances = input.readUsdcBalances ?? readBaseUsdcBalances;
  const verifySignedRequest = input.verifySignedRequest ?? verifySignedAgentRequest;

  router.get('/mobile/agents', guarded(async (req, res) => {
    const userId = currentUserId(req, res);
    if (!userId) {
      return;
    }

    const agents = await listAgentsForUser(userId, deps);
    const balances = await readUsdcBalances(agents.map((agent) => agent.walletAddress as Address));
    if (balances.kind === 'missing_rpc') {
      console.error(`❌ [AGENTS] ${balances.requiredEnv} is not set; agent balances are unavailable.`);
    } else if (balances.kind === 'rpc_error') {
      console.error('❌ [AGENTS] Base USDC read failed:', { name: balances.name });
    }

    return res.json({
      agents: agents.map((agent) =>
        agentJson(agent, balances.kind === 'ok' ? (balances.balances[agent.walletAddress.toLowerCase()] ?? null) : null),
      ),
      balancesAvailable: balances.kind === 'ok',
    });
  }));

  router.post('/mobile/agents', guarded(async (req, res) => {
    const userId = currentUserId(req, res);
    if (!userId) {
      return;
    }

    const parsed = addAgentBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, 'BadRequest', 'Enter a name, choose a kind, and paste a valid Base wallet address.');
    }

    const result = await addAgentForUser(userId, parsed.data, deps);
    if (result.kind === 'duplicate') {
      return sendError(res, 409, 'AgentAlreadyListed', 'An agent with this wallet address is already in your list.');
    }
    if (result.kind === 'limit') {
      return sendError(res, 409, 'AgentLimitReached', AGENT_LIMIT_MESSAGE);
    }

    return res.status(201).json({ agent: agentJson(result.agent, null) });
  }));

  router.post('/mobile/agents/pairing-codes', guarded(async (req, res) => {
    const userId = currentUserId(req, res);
    if (!userId) {
      return;
    }

    const parsed = pairingCodeBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, 'BadRequest', 'Enter a name and choose a kind for the agent you are pairing.');
    }

    return res.status(201).json(await createPairingCodeForUser(userId, parsed.data, deps));
  }));

  router.get('/mobile/agents/pairing-codes/:code', guarded(async (req, res) => {
    const userId = currentUserId(req, res);
    if (!userId) {
      return;
    }
    const params = codeParamsSchema.safeParse(req.params);
    if (!params.success) {
      return sendError(res, 400, 'BadRequest', 'That pairing code is not in the expected shape.');
    }

    return res.json(await pairingCodeStatusForUser(userId, params.data.code, deps));
  }));

  router.post('/mobile/agents/pairing-codes/:code/confirm', guarded(async (req, res) => {
    const userId = currentUserId(req, res);
    if (!userId) {
      return;
    }
    const params = codeParamsSchema.safeParse(req.params);
    if (!params.success) {
      return sendError(res, 400, 'BadRequest', 'That pairing code is not in the expected shape.');
    }

    const result = await confirmPairingForUser(userId, params.data.code, deps);
    if (result.kind === 'expired') {
      return sendError(res, 409, 'PairingCodeExpired', 'This code expired. Make a new one.');
    }
    if (result.kind === 'not_ready') {
      return sendError(res, 409, 'PairingNotReady', 'No agent has used this code yet.');
    }
    if (result.kind === 'limit') {
      return sendError(res, 409, 'AgentLimitReached', AGENT_LIMIT_MESSAGE);
    }

    return res.json({ agent: agentJson(result.agent, null) });
  }));

  router.delete('/mobile/agents/pairing-codes/:code', guarded(async (req, res) => {
    const userId = currentUserId(req, res);
    if (!userId) {
      return;
    }
    const params = codeParamsSchema.safeParse(req.params);
    if (!params.success) {
      return sendError(res, 400, 'BadRequest', 'That pairing code is not in the expected shape.');
    }

    await discardPairingCodeForUser(userId, params.data.code, deps);
    return res.json({ discarded: true });
  }));

  router.patch('/mobile/agents/:agent_id', guarded(async (req, res) => {
    const userId = currentUserId(req, res);
    if (!userId) {
      return;
    }

    const params = agentIdParamsSchema.safeParse(req.params);
    const body = renameAgentBodySchema.safeParse(req.body);
    if (!params.success || !body.success) {
      return sendError(res, 400, 'BadRequest', 'Enter a name between 1 and 60 characters.');
    }

    const agent = await renameAgentForUser(userId, params.data.agent_id, body.data.name, deps);
    if (!agent) {
      return sendError(res, 404, 'AgentNotFound', 'This agent is not in your list.');
    }

    return res.json({ agent: agentJson(agent, null) });
  }));

  router.delete('/mobile/agents/:agent_id', guarded(async (req, res) => {
    const userId = currentUserId(req, res);
    if (!userId) {
      return;
    }

    const params = agentIdParamsSchema.safeParse(req.params);
    if (!params.success) {
      return sendError(res, 400, 'BadRequest', 'Agent ID is required.');
    }

    const removed = await removeAgentForUser(userId, params.data.agent_id, deps);
    if (!removed) {
      return sendError(res, 404, 'AgentNotFound', 'This agent is not in your list.');
    }

    return res.json({ removed: true });
  }));

  router.post('/agent/pair', guarded(async (req, res) => {
    if (!isJsonContentType(req.headers['content-type'])) {
      return sendError(res, 415, 'UnsupportedMediaType', 'Send the pairing code as JSON with content-type application/json.');
    }
    if (!hasWellFormedProofHeaders(req)) {
      return sendError(res, 400, 'BadRequest', 'The signed request headers are not in the expected shape. Sign the request again and resend it.');
    }

    const body = rawBody(req);
    let parsedBody: z.infer<typeof pairBodySchema>;
    try {
      const candidate = pairBodySchema.safeParse(JSON.parse(body));
      if (!candidate.success) {
        return sendError(res, 400, 'BadRequest', PAIR_BODY_MESSAGE);
      }
      parsedBody = candidate.data;
    } catch {
      return sendError(res, 400, 'BadRequest', PAIR_BODY_MESSAGE);
    }

    const verification = await verifySignedRequest({
      method: req.method,
      path: req.originalUrl || req.url,
      headers: forwardedHeaders(req),
      body,
    });

    if (verification.kind === 'missing_config') {
      console.error(`❌ [AGENTS] ${verification.requiredEnv} is not set; agents cannot pair.`);
      return sendError(res, 503, 'PairingUnavailable', "Agent pairing isn't available on this server right now.");
    }
    if (verification.kind === 'unavailable') {
      console.warn('⚠️ [AGENTS] Sign-in service unavailable:', { reason: verification.reason });
      return sendError(res, 503, 'SignInServiceBusy', 'Sign-in service is busy, try again.');
    }
    if (verification.kind === 'replayed') {
      return sendError(res, 409, 'SignedRequestReplayed', 'This signed request was already used. Send a fresh one.');
    }
    if (verification.kind === 'rejected') {
      console.warn('⚠️ [AGENTS] Signed pairing request rejected:', { status: verification.status });
      return sendError(res, 401, 'SignedRequestRejected', 'This signed request was not accepted. Sign in again and retry with a fresh request.');
    }

    const result = await redeemPairingCode(parsedBody.code, verification.walletAddress, deps);
    if (result.kind === 'expired') {
      return sendError(res, 409, 'PairingCodeExpired', 'This pairing code has expired or is not valid. Ask for a new one from the app.');
    }
    if (result.kind === 'already_used') {
      return sendError(res, 409, 'PairingCodeUsed', 'This pairing code was already used. Ask for a new one from the app.');
    }

    return res.json({
      status: 'awaiting_confirmation',
      message: 'Your wallet address is recorded. The person now confirms it in their Regents app.',
    });
  }));

  return router;
}
