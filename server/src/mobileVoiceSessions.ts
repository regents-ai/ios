import { createHash, randomUUID } from 'node:crypto';

import { createJsonFileStore } from './jsonFileStore.js';

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

const mobileVoiceSessionStore = createJsonFileStore<MobileVoiceSessionStoreState>('mobile-voice-sessions.json', () => ({
  sessions: {},
}));

function nowIso() {
  return new Date().toISOString();
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

export function createMobileVoiceSessionRecord(input: {
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
}) {
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

  mobileVoiceSessionStore.update((state) => {
    state.sessions[record.id] = record;
  });

  return record;
}

export function getMobileVoiceSessionForUser(input: {
  userId: string;
  agentId: string;
  sessionId: string;
}) {
  const record = mobileVoiceSessionStore.read().sessions[input.sessionId];

  if (!record || record.user_id !== input.userId || record.agent_id !== input.agentId) {
    return null;
  }

  return record;
}

export function disconnectMobileVoiceSession(input: {
  userId: string;
  agentId: string;
  sessionId: string;
}) {
  const state = mobileVoiceSessionStore.read();
  const record = state.sessions[input.sessionId];

  if (!record || record.user_id !== input.userId || record.agent_id !== input.agentId) {
    return null;
  }

  const timestamp = nowIso();
  const updated: MobileVoiceSessionRecord = {
    ...record,
    status: 'disconnected',
    ended_at: timestamp,
    updated_at: timestamp,
  };

  mobileVoiceSessionStore.update((nextState) => {
    nextState.sessions[input.sessionId] = updated;
  });

  return updated;
}

export function getActiveMobileVoiceSession(userId: string, agentId: string) {
  const now = Date.now();

  return Object.values(mobileVoiceSessionStore.read().sessions)
    .filter((session) => session.user_id === userId && session.agent_id === agentId)
    .filter((session) => session.status === 'active' && new Date(session.expires_at).getTime() > now)
    .sort((left, right) => right.created_at.localeCompare(left.created_at))[0] || null;
}

export function resetMobileVoiceSessionsForTests() {
  return mobileVoiceSessionStore.reset();
}

export function getMobileVoiceSessionStateFilePathForTests() {
  return mobileVoiceSessionStore.filePath;
}
