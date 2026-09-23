import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';

import { createJsonFileStore } from './jsonFileStore.js';

/**
 * "My agents": the list each signed-in user keeps of the agents they fund.
 *
 * Storage is one key per user (that user's agent list), one key per pairing
 * code (with a native ten-minute expiry), and one key per paired agent wallet
 * listing the users who paired it. Redis in release; locally a JSON file
 * holds the same entries. A damaged value only ever affects the one user,
 * code or wallet it belongs to, and it is reported, never replaced or written
 * back.
 *
 * Pairing is two steps. The agent redeems the code with a SIWA-signed
 * request, which records its verified wallet address on the code; the user
 * then confirms that address in the app, which moves it into their list and
 * deletes the code. Redemption is a compare-and-swap from "waiting" to
 * "redeemed", so exactly one agent wins a code.
 *
 * The wallet index answers "who paired this agent?" for signed agent
 * requests. It always holds every user whose list has that wallet paired:
 * the user is added before a confirmation writes the list and removed after
 * a removal writes it, so a reader checks each listed user's own list.
 */

export const MOBILE_AGENT_KINDS = ['muse', 'grok_bot', 'hermes', 'other'] as const;
export type MobileAgentKind = (typeof MOBILE_AGENT_KINDS)[number];

export const PAIRING_CODE_LIFETIME_MS = 10 * 60 * 1000;
export const MAX_AGENTS_PER_USER = 50;

const KEY_PREFIX = 'regents:mobile-agents:v1';
const MAX_WRITE_ATTEMPTS = 20;
const MAX_CODE_ATTEMPTS = 5;

export const evmAddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
export const agentNameSchema = z.string().trim().min(1).max(60);
export const agentKindSchema = z.enum(MOBILE_AGENT_KINDS);

const agentRecordSchema = z
  .object({
    id: z.string().min(1),
    name: agentNameSchema,
    kind: agentKindSchema,
    walletAddress: evmAddressSchema,
    paired: z.boolean(),
    createdAt: z.string().datetime(),
  })
  .strict();
const agentListSchema = z.array(agentRecordSchema);

const pairingCodeRecordSchema = z
  .object({
    userId: z.string().min(1),
    name: agentNameSchema,
    kind: agentKindSchema,
    expiresAt: z.number().int().positive(),
    // null while the code waits for an agent; the SIWA-verified address once
    // an agent has redeemed it and the user's confirmation is pending.
    walletAddress: evmAddressSchema.nullable(),
  })
  .strict();

const walletUsersSchema = z.array(z.string().min(1));

export type MobileAgentRecord = z.infer<typeof agentRecordSchema>;
type PairingCodeRecord = z.infer<typeof pairingCodeRecordSchema>;

/** The stored value at a key could not be read as the current shape. */
export class MobileAgentsStateError extends Error {
  constructor(
    readonly key: string,
    readonly issues: string[],
  ) {
    super(`Stored mobile-agents state at ${key} is invalid`);
    this.name = 'MobileAgentsStateError';
  }
}

export function parseStored<T>(schema: z.ZodType<T>, key: string, raw: string): T {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new MobileAgentsStateError(key, ['value is not JSON']);
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new MobileAgentsStateError(
      key,
      parsed.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    );
  }
  return parsed.data;
}

/**
 * The small key-value surface the agents list needs. `compareAndSwap` writes
 * only when the key still holds `expected` (`null`: is still absent) and
 * keeps any expiry the key already has.
 */
export type MobileAgentsKv = {
  get(key: string): Promise<string | null>;
  setIfAbsent(key: string, value: string, ttlMs: number): Promise<boolean>;
  compareAndSwap(key: string, expected: string | null, next: string): Promise<boolean>;
  del(key: string): Promise<void>;
};

export type RedisClientLike = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { PX?: number; NX?: boolean }): Promise<string | null>;
  del(key: string): Promise<number>;
  eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown>;
};

// GET/SET as one atomic step. '' stands for "absent": stored values are always
// JSON objects or arrays, never the empty string.
const COMPARE_AND_SWAP_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if (current == false and ARGV[1] == '') or current == ARGV[1] then
  redis.call('SET', KEYS[1], ARGV[2], 'KEEPTTL')
  return 1
end
return 0
`;

export function redisMobileAgentsKv(redis: RedisClientLike): MobileAgentsKv {
  return {
    get: (key) => redis.get(key),
    async setIfAbsent(key, value, ttlMs) {
      return (await redis.set(key, value, { PX: ttlMs, NX: true })) === 'OK';
    },
    async compareAndSwap(key, expected, next) {
      const swapped = await redis.eval(COMPARE_AND_SWAP_SCRIPT, { keys: [key], arguments: [expected ?? '', next] });
      return Number(swapped) === 1;
    },
    async del(key) {
      await redis.del(key);
    },
  };
}

type LocalEntry = { value: string; expiresAt: number | null };
export type LocalEntries = { entries: Record<string, LocalEntry> };
export type LocalEntriesStore = {
  read(): LocalEntries;
  update(mutator: (state: LocalEntries) => void): LocalEntries;
};

/** Same layout as Redis, over a single-process store: one entry per key with its own expiry. */
export function localMobileAgentsKv(store: LocalEntriesStore, now: () => number = Date.now): MobileAgentsKv {
  const live = (entry: LocalEntry | undefined) =>
    entry && (entry.expiresAt === null || entry.expiresAt > now()) ? entry : undefined;

  return {
    async get(key) {
      return live(store.read().entries[key])?.value ?? null;
    },
    async setIfAbsent(key, value, ttlMs) {
      let written = false;
      store.update((state) => {
        if (live(state.entries[key])) {
          return;
        }
        state.entries[key] = { value, expiresAt: now() + ttlMs };
        written = true;
      });
      return written;
    },
    async compareAndSwap(key, expected, next) {
      let swapped = false;
      store.update((state) => {
        const current = live(state.entries[key]);
        if ((current?.value ?? null) !== expected) {
          return;
        }
        state.entries[key] = { value: next, expiresAt: current?.expiresAt ?? null };
        swapped = true;
      });
      return swapped;
    },
    async del(key) {
      store.update((state) => {
        delete state.entries[key];
      });
    },
  };
}

export function fileMobileAgentsKv(): MobileAgentsKv {
  return localMobileAgentsKv(createJsonFileStore<LocalEntries>('mobile-agents.json', () => ({ entries: {} })));
}

export type MobileAgentsDeps = {
  kv: MobileAgentsKv;
  now?: () => number;
};

const userKey = (userId: string) => `${KEY_PREFIX}:user:${userId}`;
const codeKey = (code: string) => `${KEY_PREFIX}:code:${code}`;
const walletKey = (walletAddress: string) => `${KEY_PREFIX}:wallet:${walletAddress.toLowerCase()}`;

function sameAddress(first: string, second: string) {
  return first.toLowerCase() === second.toLowerCase();
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

async function readUserAgents(kv: MobileAgentsKv, userId: string): Promise<MobileAgentRecord[]> {
  const key = userKey(userId);
  const raw = await kv.get(key);
  return raw === null ? [] : parseStored(agentListSchema, key, raw);
}

/**
 * Read-modify-write of one stored value. `decode` reads the raw value (null:
 * absent); `mutate` changes it in place and returns whether to write it. A
 * parse failure throws before anything is written, and a concurrent write
 * makes the whole step run again on the fresh value.
 */
export async function compareAndSwapUpdate<T, R>(
  kv: MobileAgentsKv,
  key: string,
  decode: (raw: string | null) => T,
  mutate: (value: T) => { write: boolean; result: R },
): Promise<R> {
  for (let attempt = 1; attempt <= MAX_WRITE_ATTEMPTS; attempt += 1) {
    const raw = await kv.get(key);
    const value = decode(raw);
    const { write, result } = mutate(value);
    if (!write || (await kv.compareAndSwap(key, raw, JSON.stringify(value)))) {
      return result;
    }
  }
  throw new Error(`Update for ${key} kept conflicting with concurrent writers.`);
}

function updateUserAgents<R>(
  kv: MobileAgentsKv,
  userId: string,
  mutate: (agents: MobileAgentRecord[]) => { write: boolean; result: R },
): Promise<R> {
  const key = userKey(userId);
  return compareAndSwapUpdate(kv, key, (raw) => (raw === null ? [] : parseStored(agentListSchema, key, raw)), mutate);
}

function updateWalletUsers(kv: MobileAgentsKv, walletAddress: string, mutate: (userIds: string[]) => boolean) {
  const key = walletKey(walletAddress);
  return compareAndSwapUpdate(
    kv,
    key,
    (raw) => (raw === null ? [] : parseStored(walletUsersSchema, key, raw)),
    (userIds) => ({ write: mutate(userIds), result: undefined }),
  );
}

function addWalletUser(kv: MobileAgentsKv, walletAddress: string, userId: string) {
  return updateWalletUsers(kv, walletAddress, (userIds) => {
    if (userIds.includes(userId)) {
      return false;
    }
    userIds.push(userId);
    return true;
  });
}

function removeWalletUser(kv: MobileAgentsKv, walletAddress: string, userId: string) {
  return updateWalletUsers(kv, walletAddress, (userIds) => {
    const index = userIds.indexOf(userId);
    if (index < 0) {
      return false;
    }
    userIds.splice(index, 1);
    return true;
  });
}

async function readPairingCode(kv: MobileAgentsKv, code: string): Promise<{ raw: string; record: PairingCodeRecord } | null> {
  const key = codeKey(code);
  const raw = await kv.get(key);
  return raw === null ? null : { raw, record: parseStored(pairingCodeRecordSchema, key, raw) };
}

export function listAgentsForUser(userId: string, deps: MobileAgentsDeps): Promise<MobileAgentRecord[]> {
  return readUserAgents(deps.kv, userId);
}

export type AddAgentResult = { kind: 'added'; agent: MobileAgentRecord } | { kind: 'duplicate' } | { kind: 'limit' };

export function addAgentForUser(
  userId: string,
  input: { name: string; kind: MobileAgentKind; walletAddress: string },
  deps: MobileAgentsDeps,
): Promise<AddAgentResult> {
  const now = deps.now ?? Date.now;
  return updateUserAgents<AddAgentResult>(deps.kv, userId, (agents) => {
    if (agents.some((agent) => sameAddress(agent.walletAddress, input.walletAddress))) {
      return { write: false, result: { kind: 'duplicate' } };
    }
    if (agents.length >= MAX_AGENTS_PER_USER) {
      return { write: false, result: { kind: 'limit' } };
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
    return { write: true, result: { kind: 'added', agent } };
  });
}

export function renameAgentForUser(
  userId: string,
  agentId: string,
  name: string,
  deps: MobileAgentsDeps,
): Promise<MobileAgentRecord | null> {
  return updateUserAgents<MobileAgentRecord | null>(deps.kv, userId, (agents) => {
    const agent = agents.find((candidate) => candidate.id === agentId);
    if (!agent) {
      return { write: false, result: null };
    }
    agent.name = name;
    return { write: true, result: agent };
  });
}

export async function removeAgentForUser(userId: string, agentId: string, deps: MobileAgentsDeps): Promise<boolean> {
  const removed = await updateUserAgents<MobileAgentRecord | null>(deps.kv, userId, (agents) => {
    const index = agents.findIndex((candidate) => candidate.id === agentId);
    if (index < 0) {
      return { write: false, result: null };
    }
    const [agent] = agents.splice(index, 1);
    return { write: true, result: agent ?? null };
  });
  if (!removed) {
    return false;
  }
  if (removed.paired) {
    await removeWalletUser(deps.kv, removed.walletAddress, userId);
  }
  return true;
}

export async function createPairingCodeForUser(
  userId: string,
  input: { name: string; kind: MobileAgentKind },
  deps: MobileAgentsDeps,
): Promise<{ code: string; expiresAt: string }> {
  const now = deps.now ?? Date.now;
  for (let attempt = 1; attempt <= MAX_CODE_ATTEMPTS; attempt += 1) {
    const code = newPairingCode();
    const expiresAt = now() + PAIRING_CODE_LIFETIME_MS;
    const record: PairingCodeRecord = { userId, name: input.name, kind: input.kind, expiresAt, walletAddress: null };
    if (await deps.kv.setIfAbsent(codeKey(code), JSON.stringify(record), PAIRING_CODE_LIFETIME_MS)) {
      return { code, expiresAt: new Date(expiresAt).toISOString() };
    }
  }
  throw new Error('Could not issue a pairing code that is not already in use.');
}

export type RedeemPairingCodeResult = { kind: 'recorded' } | { kind: 'already_used' } | { kind: 'expired' };

/**
 * Records the SIWA-verified wallet on a waiting code. The swap from waiting
 * to redeemed is atomic, so a second agent (or a second try) finds the code
 * already used.
 */
export async function redeemPairingCode(
  rawCode: string,
  walletAddress: string,
  deps: MobileAgentsDeps,
): Promise<RedeemPairingCodeResult> {
  const now = deps.now ?? Date.now;
  const code = normalizePairingCode(rawCode);
  for (let attempt = 1; attempt <= MAX_WRITE_ATTEMPTS; attempt += 1) {
    const stored = await readPairingCode(deps.kv, code);
    if (!stored || stored.record.expiresAt <= now()) {
      return { kind: 'expired' };
    }
    if (stored.record.walletAddress !== null) {
      return { kind: 'already_used' };
    }
    const next: PairingCodeRecord = { ...stored.record, walletAddress };
    if (await deps.kv.compareAndSwap(codeKey(code), stored.raw, JSON.stringify(next))) {
      return { kind: 'recorded' };
    }
  }
  throw new Error(`Pairing code ${code} kept conflicting with concurrent writers.`);
}

export type PairingCodeStatus =
  | { status: 'waiting'; expiresAt: string }
  | { status: 'needs_confirmation'; walletAddress: string; expiresAt: string }
  | { status: 'expired' };

/** A code that is missing, expired, or belongs to someone else reads as expired. */
export async function pairingCodeStatusForUser(userId: string, rawCode: string, deps: MobileAgentsDeps): Promise<PairingCodeStatus> {
  const now = deps.now ?? Date.now;
  const stored = await readPairingCode(deps.kv, normalizePairingCode(rawCode));
  if (!stored || stored.record.userId !== userId || stored.record.expiresAt <= now()) {
    return { status: 'expired' };
  }
  const expiresAt = new Date(stored.record.expiresAt).toISOString();
  return stored.record.walletAddress === null
    ? { status: 'waiting', expiresAt }
    : { status: 'needs_confirmation', walletAddress: stored.record.walletAddress, expiresAt };
}

export type ConfirmPairingResult =
  | { kind: 'confirmed'; agent: MobileAgentRecord }
  | { kind: 'not_ready' }
  | { kind: 'expired' }
  | { kind: 'limit' };

/**
 * Moves the redeemed address into the user's list as a paired agent. A
 * wallet already listed (added by address, or paired before) becomes paired
 * under its existing entry; otherwise a new entry takes the code's name and
 * kind. The code is deleted once the list is written.
 */
export async function confirmPairingForUser(userId: string, rawCode: string, deps: MobileAgentsDeps): Promise<ConfirmPairingResult> {
  const now = deps.now ?? Date.now;
  const code = normalizePairingCode(rawCode);
  const stored = await readPairingCode(deps.kv, code);
  if (!stored || stored.record.userId !== userId || stored.record.expiresAt <= now()) {
    return { kind: 'expired' };
  }
  const { walletAddress, name, kind } = stored.record;
  if (walletAddress === null) {
    return { kind: 'not_ready' };
  }

  await addWalletUser(deps.kv, walletAddress, userId);
  const result = await updateUserAgents<ConfirmPairingResult>(deps.kv, userId, (agents) => {
    const existing = agents.find((agent) => sameAddress(agent.walletAddress, walletAddress));
    if (existing) {
      existing.paired = true;
      return { write: true, result: { kind: 'confirmed', agent: existing } };
    }
    if (agents.length >= MAX_AGENTS_PER_USER) {
      return { write: false, result: { kind: 'limit' } };
    }
    const agent: MobileAgentRecord = {
      id: randomUUID(),
      name,
      kind,
      walletAddress,
      paired: true,
      createdAt: new Date(now()).toISOString(),
    };
    agents.push(agent);
    return { write: true, result: { kind: 'confirmed', agent } };
  });

  if (result.kind === 'confirmed') {
    await deps.kv.del(codeKey(code));
  }
  return result;
}

/**
 * Every user who has this wallet paired, with their own list entry for it.
 * The wallet index may name a user whose list no longer pairs the wallet (a
 * confirmation that hit the list limit); that user's list is the answer.
 */
export async function pairedAgentsForWallet(
  walletAddress: string,
  deps: MobileAgentsDeps,
): Promise<{ userId: string; agent: MobileAgentRecord }[]> {
  const key = walletKey(walletAddress);
  const raw = await deps.kv.get(key);
  const userIds = raw === null ? [] : parseStored(walletUsersSchema, key, raw);
  const pairings = await Promise.all(
    userIds.map(async (userId) => {
      const agent = (await readUserAgents(deps.kv, userId)).find(
        (candidate) => candidate.paired && sameAddress(candidate.walletAddress, walletAddress),
      );
      return agent ? { userId, agent } : null;
    }),
  );
  return pairings.filter((pairing) => pairing !== null);
}

/** "Not mine": drops the code so the recorded address is never listed. */
export async function discardPairingCodeForUser(userId: string, rawCode: string, deps: MobileAgentsDeps): Promise<void> {
  const code = normalizePairingCode(rawCode);
  const stored = await readPairingCode(deps.kv, code);
  if (stored && stored.record.userId === userId) {
    await deps.kv.del(codeKey(code));
  }
}
