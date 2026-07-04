import { createHash, randomUUID } from 'node:crypto';

import { createSharedStateStore, type SharedStateRedis } from './sharedStateStore.js';

export type MobileVoiceSessionStatus = 'active' | 'disconnected' | 'expired';

export type MobileVoiceSessionRecord = {
  id: string;
  user_id: string;
  agent_id: string;
  hermes_runtime_id: string | null;
  provider: 'openai-realtime';
  model: string;
  status: MobileVoiceSessionStatus;
  hermes_session_id: string | null;
  realtime_session_id: string | null;
  tool_registry_digest: string;
  safety_identifier_hash: string;
  started_at: string;
  expires_at: string;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
};

type MobileVoiceSessionStoreState = {
  sessions: Record<string, MobileVoiceSessionRecord>;
};

const mobileVoiceSessionStore = createSharedStateStore<MobileVoiceSessionStoreState>('mobile-voice-sessions', () => ({
  sessions: {},
}));

// Bounded retention so the shared state cannot grow forever. Live sessions
// (active and not yet expired) are never pruned; everything else is dropped
// once it has been idle past the retention window, and oldest-first past the
// hard cap.
const FINISHED_VOICE_SESSION_RETENTION_MS = 24 * 60 * 60 * 1000;
const MAX_VOICE_SESSION_RECORDS = 500;

function nowIso() {
  return new Date().toISOString();
}

function isLiveVoiceSession(session: MobileVoiceSessionRecord, now: number) {
  return session.status === 'active' && new Date(session.expires_at).getTime() > now;
}

function pruneVoiceSessionsInPlace(state: MobileVoiceSessionStoreState, now: number) {
  for (const session of Object.values(state.sessions)) {
    if (isLiveVoiceSession(session, now)) {
      continue;
    }
    if (now - new Date(session.updated_at).getTime() > FINISHED_VOICE_SESSION_RETENTION_MS) {
      delete state.sessions[session.id];
    }
  }

  let overflow = Object.keys(state.sessions).length - MAX_VOICE_SESSION_RECORDS;
  if (overflow <= 0) {
    return;
  }

  const prunable = Object.values(state.sessions)
    .filter((session) => !isLiveVoiceSession(session, now))
    .sort((left, right) => left.updated_at.localeCompare(right.updated_at));
  for (const session of prunable) {
    if (overflow <= 0) {
      break;
    }
    delete state.sessions[session.id];
    overflow -= 1;
  }
}

export async function pruneMobileVoiceSessions(now = new Date(), redis?: SharedStateRedis | null) {
  await mobileVoiceSessionStore.update((state) => pruneVoiceSessionsInPlace(state, now.getTime()), redis);
}

export function mobileVoiceSafetyIdentifier(input: {
  userId: string;
  agentId: string;
  environment: string;
}) {
  return createHash('sha256')
    .update(`${input.userId}:${input.agentId}:${input.environment}`)
    .digest('hex');
}

export async function createMobileVoiceSessionRecord(input: {
  userId: string;
  agentId: string;
  hermesRuntimeId?: string | null;
  provider: 'openai-realtime';
  model: string;
  hermesSessionId?: string | null;
  realtimeSessionId?: string | null;
  toolRegistryDigest: string;
  safetyIdentifierHash: string;
  expiresAt: string;
}, redis?: SharedStateRedis | null) {
  const timestamp = nowIso();
  const record: MobileVoiceSessionRecord = {
    id: randomUUID(),
    user_id: input.userId,
    agent_id: input.agentId,
    hermes_runtime_id: input.hermesRuntimeId || null,
    provider: input.provider,
    model: input.model,
    status: 'active',
    hermes_session_id: input.hermesSessionId || null,
    realtime_session_id: input.realtimeSessionId || null,
    tool_registry_digest: input.toolRegistryDigest,
    safety_identifier_hash: input.safetyIdentifierHash,
    started_at: timestamp,
    expires_at: input.expiresAt,
    ended_at: null,
    created_at: timestamp,
    updated_at: timestamp,
  };

  await mobileVoiceSessionStore.update((state) => {
    pruneVoiceSessionsInPlace(state, Date.now());
    state.sessions[record.id] = record;
  }, redis);

  return record;
}

export async function getMobileVoiceSessionForUser(input: {
  userId: string;
  agentId: string;
  sessionId: string;
}, redis?: SharedStateRedis | null) {
  const record = (await mobileVoiceSessionStore.read(redis)).sessions[input.sessionId];

  if (!record || record.user_id !== input.userId || record.agent_id !== input.agentId) {
    return null;
  }

  return record;
}

export async function disconnectMobileVoiceSession(input: {
  userId: string;
  agentId: string;
  sessionId: string;
}, redis?: SharedStateRedis | null) {
  // Check and write inside one atomic update so a concurrent update to the
  // same session record can never be lost.
  let updated: MobileVoiceSessionRecord | null = null;
  await mobileVoiceSessionStore.update((state) => {
    updated = null;
    const record = state.sessions[input.sessionId];

    if (!record || record.user_id !== input.userId || record.agent_id !== input.agentId) {
      return;
    }

    const timestamp = nowIso();
    record.status = 'disconnected';
    record.ended_at = timestamp;
    record.updated_at = timestamp;
    updated = { ...record };
  }, redis);

  return updated as MobileVoiceSessionRecord | null;
}

export async function getActiveMobileVoiceSession(userId: string, agentId: string, redis?: SharedStateRedis | null) {
  const now = Date.now();

  return Object.values((await mobileVoiceSessionStore.read(redis)).sessions)
    .filter((session) => session.user_id === userId && session.agent_id === agentId)
    .filter((session) => session.status === 'active' && new Date(session.expires_at).getTime() > now)
    .sort((left, right) => right.created_at.localeCompare(left.created_at))[0] || null;
}

export async function resetMobileVoiceSessionsForTests(redis?: SharedStateRedis | null) {
  return mobileVoiceSessionStore.reset(redis);
}

export async function readMobileVoiceSessionStateForTests(redis?: SharedStateRedis | null) {
  return mobileVoiceSessionStore.read(redis);
}
