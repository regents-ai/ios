import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { sendError } from '../httpResponses.js';
import {
  createMobileVoiceSessionRecord,
  disconnectMobileVoiceSession,
  getActiveMobileVoiceSession,
  getMobileVoiceSessionForUser,
} from '../mobileVoiceSessions.js';
import type { PlatformProjection, PlatformProjectionClient, PlatformRequestAuth } from '../platformProjection.js';
import { buildRealtimeSafetyIdentifier } from '../services/realtimeClientSecret.js';
import {
  createHermesVoiceClient,
  type HermesVoiceClient,
  type HermesVoiceClientResult,
} from '../services/hermesVoiceClient.js';

const voiceParamsSchema = z.object({
  agent_id: z.string().min(1),
});

const createVoiceSessionBodySchema = z.object({
  voice: z.string().min(1).optional(),
  locale: z.string().min(1).optional(),
  timezone: z.string().min(1).optional(),
  reasoning_effort: z.enum(['minimal', 'low', 'medium', 'high', 'xhigh']).optional(),
  device_capabilities: z.array(z.string().min(1)),
  preferred_transport: z.literal('webrtc').optional(),
});

const disconnectBodySchema = z.object({
  session_id: z.string().min(1),
});

const toolResultBodySchema = z.object({
  session_id: z.string().min(1),
  tool_call_id: z.string().min(1),
  ok: z.boolean(),
  result: z.unknown().optional(),
  error: z.record(z.string(), z.unknown()).nullable().optional(),
});

function currentUserId(req: Request) {
  return req.userId || '';
}

function platformAuth(req: Request): PlatformRequestAuth {
  return {
    authorization: req.header('Authorization'),
  };
}

function agentKey(company: PlatformProjection['companies'][number]) {
  return company.public_profile.slug || company.company.slug || String(company.company.id);
}

function findCompany(projection: PlatformProjection, agentId: string) {
  return projection.companies.find(
    (company) =>
      agentKey(company) === agentId ||
      company.company.slug === agentId ||
      String(company.company.id) === agentId,
  );
}

async function readProjection(
  client: PlatformProjectionClient,
  req: Request,
  res: Response,
) {
  const projectionResult = await client.fetchProjection(platformAuth(req));

  if (projectionResult.kind === 'ok') {
    return projectionResult.projection;
  }

  if (projectionResult.kind === 'missing_config') {
    sendError(res, 503, 'PlatformProjectionMissing', `${projectionResult.requiredEnv} is required before voice can start.`);
    return null;
  }

  if (projectionResult.kind === 'unauthorized') {
    sendError(res, 401, 'Unauthorized', 'Sign in again before starting voice.');
    return null;
  }

  sendError(res, 502, 'PlatformProjectionUnavailable', projectionResult.message);
  return null;
}

function sendHermesResult<T>(
  res: Response,
  result: HermesVoiceClientResult<T>,
  render: (data: T) => unknown,
  statusCode = 200,
) {
  if (result.kind === 'ok') {
    return res.status(statusCode).json(render(result.data));
  }

  if (result.kind === 'missing_config') {
    return sendError(res, 503, 'HermesVoiceUnavailable', 'Hermes voice is not available for this build.');
  }

  if (result.kind === 'unauthorized') {
    return sendError(res, 502, 'HermesVoiceUnavailable', 'Hermes voice is unavailable right now.');
  }

  return sendError(res, 502, 'HermesVoiceUnavailable', result.message);
}

function statusFromProjection(company: PlatformProjection['companies'][number], userId: string) {
  const voice = company.runtime.voice;
  const agentId = agentKey(company);
  const active = getActiveMobileVoiceSession(userId, agentId);

  return {
    enabled: voice.enabled && voice.account.satisfied && voice.health !== 'unavailable',
    health: voice.health,
    agent_id: agentId,
    account: voice.account,
    active_session_id: active?.id || null,
    active_turn_id: null,
    queue_depth: 0,
    last_event_id: null,
  };
}

function requireVoiceReady(res: Response, company: PlatformProjection['companies'][number]) {
  const voice = company.runtime.voice;

  if (!voice.account.satisfied) {
    sendError(res, 403, 'ChatGptAccountRequired', 'Connect ChatGPT before starting voice.');
    return false;
  }

  if (!voice.enabled || voice.health === 'unavailable') {
    sendError(res, 403, 'HermesVoiceUnavailable', 'Hermes voice is not ready for this agent.');
    return false;
  }

  return true;
}

export function createMobileVoiceRoutes(input: {
  platformProjectionClient: PlatformProjectionClient;
  hermesVoiceClient?: HermesVoiceClient | undefined;
}) {
  const router = Router();
  const hermesVoiceClient = input.hermesVoiceClient || createHermesVoiceClient();

  router.get('/mobile/agents/:agent_id/voice/status', async (req, res) => {
    const parsed = voiceParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      return sendError(res, 400, 'BadRequest', 'A valid agent ID is required.');
    }

    const projection = await readProjection(input.platformProjectionClient, req, res);
    if (!projection) {
      return;
    }

    const company = findCompany(projection, parsed.data.agent_id);
    if (!company) {
      return sendError(res, 403, 'Forbidden', 'You do not have access to this agent.');
    }

    if (!company.runtime.voice.account.satisfied || !company.runtime.voice.enabled) {
      return res.json(statusFromProjection(company, currentUserId(req)));
    }

    const result = await hermesVoiceClient.status({
      statusUrl: company.runtime.voice.status_url,
      authorization: req.header('Authorization'),
    });

    return sendHermesResult(res, result, (status) => ({
      ...status,
      account: company.runtime.voice.account,
      enabled: status.enabled && company.runtime.voice.account.satisfied,
    }));
  });

  router.post('/mobile/agents/:agent_id/voice/session', async (req, res) => {
    const parsedParams = voiceParamsSchema.safeParse(req.params);
    const parsedBody = createVoiceSessionBodySchema.safeParse(req.body);
    if (!parsedParams.success || !parsedBody.success) {
      return sendError(res, 400, 'BadRequest', 'A valid voice request is required.');
    }

    const projection = await readProjection(input.platformProjectionClient, req, res);
    if (!projection) {
      return;
    }

    const company = findCompany(projection, parsedParams.data.agent_id);
    if (!company) {
      return sendError(res, 403, 'Forbidden', 'You do not have access to this agent.');
    }

    if (!requireVoiceReady(res, company)) {
      return;
    }

    const safetyIdentifier = buildRealtimeSafetyIdentifier({
      userId: currentUserId(req),
      agentId: parsedParams.data.agent_id,
    });
    const result = await hermesVoiceClient.createSession({
      sessionUrl: company.runtime.voice.session_url,
      authorization: req.header('Authorization'),
      safetyIdentifier,
      body: parsedBody.data,
    });

    if (result.kind !== 'ok') {
      return sendHermesResult(res, result, (data) => data);
    }

    const record = createMobileVoiceSessionRecord({
      userId: currentUserId(req),
      agentId: parsedParams.data.agent_id,
      hermesRuntimeId: String(company.company.id),
      provider: result.data.realtime.provider,
      model: result.data.realtime.model,
      hermesSessionId: result.data.session_id,
      realtimeSessionId: result.data.realtime.realtime_session_id || null,
      toolRegistryDigest: company.runtime.voice.tool_registry_digest,
      safetyIdentifierHash: safetyIdentifier,
      expiresAt: result.data.expires_at,
    });

    const { realtime_session_id: _realtimeSessionId, ...mobileRealtime } = result.data.realtime;

    return res.status(201).json({
      ...result.data,
      session_id: record.id,
      realtime: mobileRealtime,
      account: company.runtime.voice.account,
    });
  });

  router.post('/mobile/agents/:agent_id/voice/prewarm', async (req, res) => {
    const parsed = voiceParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      return sendError(res, 400, 'BadRequest', 'A valid agent ID is required.');
    }

    const projection = await readProjection(input.platformProjectionClient, req, res);
    if (!projection) {
      return;
    }

    const company = findCompany(projection, parsed.data.agent_id);
    if (!company) {
      return sendError(res, 403, 'Forbidden', 'You do not have access to this agent.');
    }

    if (!requireVoiceReady(res, company)) {
      return;
    }

    const result = await hermesVoiceClient.prewarm({
      sessionUrl: company.runtime.voice.session_url,
      authorization: req.header('Authorization'),
      safetyIdentifier: buildRealtimeSafetyIdentifier({
        userId: currentUserId(req),
        agentId: parsed.data.agent_id,
      }),
    });

    return sendHermesResult(res, result, (data) => data, 202);
  });

  router.post('/mobile/agents/:agent_id/voice/disconnect', async (req, res) => {
    const parsedParams = voiceParamsSchema.safeParse(req.params);
    const parsedBody = disconnectBodySchema.safeParse(req.body);
    if (!parsedParams.success || !parsedBody.success) {
      return sendError(res, 400, 'BadRequest', 'A valid voice session is required.');
    }

    const projection = await readProjection(input.platformProjectionClient, req, res);
    if (!projection) {
      return;
    }

    const company = findCompany(projection, parsedParams.data.agent_id);
    if (!company) {
      return sendError(res, 403, 'Forbidden', 'You do not have access to this agent.');
    }

    const localSession = getMobileVoiceSessionForUser({
      userId: currentUserId(req),
      agentId: parsedParams.data.agent_id,
      sessionId: parsedBody.data.session_id,
    });
    if (!localSession?.hermes_session_id) {
      return sendError(res, 404, 'VoiceSessionNotFound', 'This voice session is no longer active.');
    }

    const result = await hermesVoiceClient.disconnect({
      sessionUrl: company.runtime.voice.session_url,
      authorization: req.header('Authorization'),
      safetyIdentifier: buildRealtimeSafetyIdentifier({
        userId: currentUserId(req),
        agentId: parsedParams.data.agent_id,
      }),
      body: { session_id: localSession.hermes_session_id },
    });

    if (result.kind === 'ok') {
      disconnectMobileVoiceSession({
        userId: currentUserId(req),
        agentId: parsedParams.data.agent_id,
        sessionId: parsedBody.data.session_id,
      });
    }

    return sendHermesResult(res, result, (data) => data);
  });

  router.post('/mobile/agents/:agent_id/voice/tool-results', async (req, res) => {
    const parsedParams = voiceParamsSchema.safeParse(req.params);
    const parsedBody = toolResultBodySchema.safeParse(req.body);
    if (!parsedParams.success || !parsedBody.success) {
      return sendError(res, 400, 'BadRequest', 'A valid voice result is required.');
    }

    const projection = await readProjection(input.platformProjectionClient, req, res);
    if (!projection) {
      return;
    }

    const company = findCompany(projection, parsedParams.data.agent_id);
    if (!company) {
      return sendError(res, 403, 'Forbidden', 'You do not have access to this agent.');
    }

    if (!requireVoiceReady(res, company)) {
      return;
    }

    const localSession = getMobileVoiceSessionForUser({
      userId: currentUserId(req),
      agentId: parsedParams.data.agent_id,
      sessionId: parsedBody.data.session_id,
    });
    if (!localSession?.hermes_session_id) {
      return sendError(res, 404, 'VoiceSessionNotFound', 'This voice session is no longer active.');
    }

    const result = await hermesVoiceClient.submitToolResult({
      sessionUrl: company.runtime.voice.session_url,
      authorization: req.header('Authorization'),
      safetyIdentifier: buildRealtimeSafetyIdentifier({
        userId: currentUserId(req),
        agentId: parsedParams.data.agent_id,
      }),
      body: {
        ...parsedBody.data,
        session_id: localSession.hermes_session_id,
      },
    });

    return sendHermesResult(res, result, (data) => data, 202);
  });

  return router;
}
