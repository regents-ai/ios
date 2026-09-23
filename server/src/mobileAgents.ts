import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';

import { createSharedStateStore, type SharedStateRedis } from './sharedStateStore.js';

/**
 * "My agents": the list each signed-in user keeps of the agents they fund.
 *
 * An agent enters the list in one of two ways. Pasting its Base wallet address
 * adds it unpaired. Giving it a pairing code lets the agent prove it holds the
 * wallet key (a SIWA-signed request to /agent/pair): the verified address is
 * then recorded as paired in the list of the user who created the code.
 *
 * State lives in the shared state store (Redis in release, memory locally),
 * keyed by user, exactly like Nous Portal pairing.
 */

export const MOBILE_AGENT_KINDS = ['muse', 'grok_bot', 'hermes', 'other'] as const;
export type MobileAgentKind = (typeof MOBILE_AGENT_KINDS)[number];

export const PAIRING_CODE_LIFETIME_MS = 10 * 60 * 1000;

export const evmAddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
export const agentNameSchema = z.string().trim().min(1).max(60);
export const agentKindSchema = z.enum(MOBILE_AGENT_KINDS);

const agentRecordSchema = z.object({
  id: z.string().min(1),
  name: agentNameSchema,
  kind: agentKindSchema,
  walletAddress: evmAddressSchema,
  paired: z.boolean(),
  createdAt: z.string().datetime(),
});

const pairingCodeRecordSchema = z.object({
  userId: z.string().min(1),
  name: agentNameSchema,
  kind: agentKindSchema,
  expiresAt: z.number().int().positive(),
});

const mobileAgentsStateSchema = z.object({
  agentsByUser: z.record(z.string(), z.array(agentRecordSchema)),
  pairingCodes: z.record(z.string(), pairingCodeRecordSchema),
});

export type MobileAgentRecord = z.infer<typeof agentRecordSchema>;
type PairingCodeRecord = z.infer<typeof pairingCodeRecordSchema>;
type MobileAgentsState = z.infer<typeof mobileAgentsStateSchema>;

function initialState(): MobileAgentsState {
  return { agentsByUser: {}, pairingCodes: {} };
}

export function createMobileAgentsStore(key = 'regents:mobile-agents:v1') {
  return createSharedStateStore(key, initialState);
}

export type MobileAgentsStore = ReturnType<typeof createMobileAgentsStore>;

const defaultStore = createMobileAgentsStore();

export type MobileAgentsDeps = {
  store?: MobileAgentsStore;
  redis?: SharedStateRedis | null;
  now?: () => number;
};

function resolveDeps(deps?: MobileAgentsDeps) {
  return {
    store: deps?.store ?? defaultStore,
    redis: deps?.redis ?? null,
    now: deps?.now ?? Date.now,
  };
}

function normalizeState(state: MobileAgentsState) {
  const parsed = mobileAgentsStateSchema.safeParse(state);
  const clean = parsed.success ? parsed.data : initialState();
  state.agentsByUser = clean.agentsByUser;
  state.pairingCodes = clean.pairingCodes;
}

function pruneExpiredCodes(state: MobileAgentsState, currentTime: number) {
  for (const [code, record] of Object.entries(state.pairingCodes)) {
    if (record.expiresAt <= currentTime) {
      delete state.pairingCodes[code];
    }
  }
}

function sameAddress(first: string, second: string) {
  return first.toLowerCase() === second.toLowerCase();
}

function userAgents(state: MobileAgentsState, userId: string) {
  return (state.agentsByUser[userId] ??= []);
}

// Unambiguous alphabet (no 0/O, 1/I) so a code read aloud or retyped survives.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function newPairingCode() {
  const bytes = randomBytes(8);
  const chars = Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]);
  return `${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`;
}

export function normalizePairingCode(value: string) {
  return value.trim().toUpperCase();
}

export async function listAgentsForUser(userId: string, deps?: MobileAgentsDeps): Promise<MobileAgentRecord[]> {
  const { store, redis } = resolveDeps(deps);
  const state = await store.read(redis);
  normalizeState(state);
  return state.agentsByUser[userId] ?? [];
}

export async function addAgentForUser(
  userId: string,
  input: { name: string; kind: MobileAgentKind; walletAddress: string },
  deps?: MobileAgentsDeps,
): Promise<{ kind: 'added'; agent: MobileAgentRecord } | { kind: 'duplicate' }> {
  const { store, redis, now } = resolveDeps(deps);
  let result: { kind: 'added'; agent: MobileAgentRecord } | { kind: 'duplicate' } = { kind: 'duplicate' };

  await store.update((state) => {
    normalizeState(state);
    const agents = userAgents(state, userId);
    if (agents.some((agent) => sameAddress(agent.walletAddress, input.walletAddress))) {
      result = { kind: 'duplicate' };
      return;
    }

    const agent: MobileAgentRecord = {
      id: randomUUID(),
      name: input.name,
      kind: input.kind,
      walletAddress: input.walletAddress,
      paired: false,
      createdAt: new Date(now()).toISOString(),
    };
    agents.push(agent);
    result = { kind: 'added', agent };
  }, redis);

  return result;
}

export async function renameAgentForUser(
  userId: string,
  agentId: string,
  name: string,
  deps?: MobileAgentsDeps,
): Promise<MobileAgentRecord | null> {
  const { store, redis } = resolveDeps(deps);
  let renamed: MobileAgentRecord | null = null;

  await store.update((state) => {
    normalizeState(state);
    renamed = null;
    const agent = userAgents(state, userId).find((candidate) => candidate.id === agentId);
    if (!agent) {
      return;
    }
    agent.name = name;
    renamed = agent;
  }, redis);

  return renamed;
}

export async function removeAgentForUser(
  userId: string,
  agentId: string,
  deps?: MobileAgentsDeps,
): Promise<boolean> {
  const { store, redis } = resolveDeps(deps);
  let removed = false;

  await store.update((state) => {
    normalizeState(state);
    const agents = userAgents(state, userId);
    const index = agents.findIndex((candidate) => candidate.id === agentId);
    removed = index >= 0;
    if (removed) {
      agents.splice(index, 1);
    }
  }, redis);

  return removed;
}

export async function createPairingCodeForUser(
  userId: string,
  input: { name: string; kind: MobileAgentKind },
  deps?: MobileAgentsDeps,
): Promise<{ code: string; expiresAt: string }> {
  const { store, redis, now } = resolveDeps(deps);
  const code = newPairingCode();
  const expiresAt = now() + PAIRING_CODE_LIFETIME_MS;

  await store.update((state) => {
    normalizeState(state);
    pruneExpiredCodes(state, now());
    state.pairingCodes[code] = { userId, name: input.name, kind: input.kind, expiresAt };
  }, redis);

  return { code, expiresAt: new Date(expiresAt).toISOString() };
}

export type PairAgentResult =
  | { kind: 'paired'; userId: string; agent: MobileAgentRecord }
  | { kind: 'expired' }
  | { kind: 'invalid' };

/**
 * Consumes a pairing code for a wallet address the SIWA server has verified.
 * The code links only to the user who created it; it works once. A wallet
 * already in that user's list (added by address earlier) becomes paired.
 */
export async function pairAgentWithCode(
  rawCode: string,
  walletAddress: string,
  deps?: MobileAgentsDeps,
): Promise<PairAgentResult> {
  const { store, redis, now } = resolveDeps(deps);
  const code = normalizePairingCode(rawCode);
  let result: PairAgentResult = { kind: 'invalid' };

  await store.update((state) => {
    normalizeState(state);
    const currentTime = now();
    const record: PairingCodeRecord | undefined = state.pairingCodes[code];
    result = { kind: 'invalid' };
    if (!record) {
      return;
    }

    delete state.pairingCodes[code];
    if (record.expiresAt <= currentTime) {
      result = { kind: 'expired' };
      return;
    }

    const agents = userAgents(state, record.userId);
    const existing = agents.find((agent) => sameAddress(agent.walletAddress, walletAddress));
    if (existing) {
      existing.paired = true;
      result = { kind: 'paired', userId: record.userId, agent: existing };
      return;
    }

    const agent: MobileAgentRecord = {
      id: randomUUID(),
      name: record.name,
      kind: record.kind,
      walletAddress,
      paired: true,
      createdAt: new Date(currentTime).toISOString(),
    };
    agents.push(agent);
    result = { kind: 'paired', userId: record.userId, agent };
  }, redis);

  return result;
}
