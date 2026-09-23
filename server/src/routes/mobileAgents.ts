import { Router, type Request, type Response } from 'express';
import type { Address } from 'viem';
import { z } from 'zod';

import { readBaseUsdcBalances, type BaseUsdcBalancesReader } from '../baseUsdcBalances.js';
import { sendError } from '../httpResponses.js';
import {
  addAgentForUser,
  agentKindSchema,
  agentNameSchema,
  createPairingCodeForUser,
  evmAddressSchema,
  listAgentsForUser,
  pairAgentWithCode,
  removeAgentForUser,
  renameAgentForUser,
  type MobileAgentRecord,
  type MobileAgentsDeps,
} from '../mobileAgents.js';
import {
  verifySignedAgentRequest,
  type SignedAgentRequestVerifier,
} from '../services/siwaHttpVerifier.js';
import type { SharedStateRedis } from '../sharedStateStore.js';

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

const pairBodySchema = z.object({ code: z.string().trim().min(1) }).strict();

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

export function createMobileAgentRoutes(input?: {
  redis?: SharedStateRedis | null;
  now?: () => number;
  store?: MobileAgentsDeps['store'];
  readUsdcBalances?: BaseUsdcBalancesReader;
  verifySignedRequest?: SignedAgentRequestVerifier;
}) {
  const router = Router();
  const deps: MobileAgentsDeps = { redis: input?.redis ?? null };
  if (input?.now) {
    deps.now = input.now;
  }
  if (input?.store) {
    deps.store = input.store;
  }
  const readUsdcBalances = input?.readUsdcBalances ?? readBaseUsdcBalances;
  const verifySignedRequest = input?.verifySignedRequest ?? verifySignedAgentRequest;

  router.get('/mobile/agents', async (req, res) => {
    const userId = currentUserId(req, res);
    if (!userId) {
      return;
    }

    const agents = await listAgentsForUser(userId, deps);
    const balances = await readUsdcBalances(agents.map((agent) => agent.walletAddress as Address));
    if (balances.kind === 'rpc_error') {
      console.error('❌ [AGENTS] Base USDC read failed:', { name: balances.name });
    }

    return res.json({
      agents: agents.map((agent) =>
        agentJson(agent, balances.kind === 'ok' ? (balances.balances[agent.walletAddress.toLowerCase()] ?? null) : null),
      ),
    });
  });

  router.post('/mobile/agents', async (req, res) => {
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

    return res.status(201).json({ agent: agentJson(result.agent, null) });
  });

  router.post('/mobile/agents/pairing-codes', async (req, res) => {
    const userId = currentUserId(req, res);
    if (!userId) {
      return;
    }

    const parsed = pairingCodeBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, 'BadRequest', 'Enter a name and choose a kind before creating a pairing code.');
    }

    const pairingCode = await createPairingCodeForUser(userId, parsed.data, deps);
    return res.status(201).json(pairingCode);
  });

  router.patch('/mobile/agents/:agent_id', async (req, res) => {
    const userId = currentUserId(req, res);
    if (!userId) {
      return;
    }

    const params = agentIdParamsSchema.safeParse(req.params);
    const body = renameAgentBodySchema.safeParse(req.body);
    if (!params.success || !body.success) {
      return sendError(res, 400, 'BadRequest', 'Enter a name for this agent.');
    }

    const agent = await renameAgentForUser(userId, params.data.agent_id, body.data.name, deps);
    if (!agent) {
      return sendError(res, 404, 'AgentNotFound', 'This agent is not in your list.');
    }

    return res.json({ agent: agentJson(agent, null) });
  });

  router.delete('/mobile/agents/:agent_id', async (req, res) => {
    const userId = currentUserId(req, res);
    if (!userId) {
      return;
    }

    const params = agentIdParamsSchema.safeParse(req.params);
    if (!params.success) {
      return sendError(res, 400, 'BadRequest', 'Choose an agent to remove.');
    }

    const removed = await removeAgentForUser(userId, params.data.agent_id, deps);
    if (!removed) {
      return sendError(res, 404, 'AgentNotFound', 'This agent is not in your list.');
    }

    return res.json({ removed: true });
  });

  // Called by the agent, not the app: a SIWA-signed request carrying the
  // pairing code the user created. The raw body is kept so the signed
  // content digest can be checked exactly as sent.
  router.post('/agent/pair', async (req, res) => {
    const body = rawBody(req);
    let parsedBody: z.infer<typeof pairBodySchema>;
    try {
      const candidate = pairBodySchema.safeParse(JSON.parse(body));
      if (!candidate.success) {
        return sendError(res, 400, 'BadRequest', 'Send a JSON body with the pairing code, for example {"code":"ABCD-EFGH"}.');
      }
      parsedBody = candidate.data;
    } catch {
      return sendError(res, 400, 'BadRequest', 'Send a JSON body with the pairing code, for example {"code":"ABCD-EFGH"}.');
    }

    const verification = await verifySignedRequest({
      method: req.method,
      path: req.originalUrl || req.url,
      headers: forwardedHeaders(req),
      body,
    });

    if (verification.kind === 'missing_config') {
      return sendError(res, 503, 'SiwaServerMissing', `${verification.requiredEnv} is required before agents can pair.`);
    }
    if (verification.kind === 'unreachable') {
      return sendError(res, 502, 'SiwaServerUnavailable', 'The signing service could not be reached. Try again shortly.');
    }
    if (verification.kind === 'rejected') {
      console.warn('⚠️ [AGENTS] Signed pairing request rejected:', { status: verification.status });
      return sendError(res, 401, 'SignedRequestRejected', 'This signed request was not accepted. Sign in again and retry with a fresh request.');
    }

    const result = await pairAgentWithCode(parsedBody.code, verification.walletAddress, deps);
    if (result.kind === 'expired') {
      return sendError(res, 409, 'PairingCodeExpired', 'This pairing code has expired. Create a new one in the app.');
    }
    if (result.kind === 'invalid') {
      return sendError(res, 409, 'PairingCodeInvalid', 'This pairing code is not valid. Create a new one in the app.');
    }

    return res.json({
      paired: true,
      agent: {
        id: result.agent.id,
        name: result.agent.name,
        kind: result.agent.kind,
        walletAddress: result.agent.walletAddress,
      },
    });
  });

  return router;
}
