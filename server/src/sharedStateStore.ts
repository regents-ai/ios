/**
 * Shared mutable server state: Redis in release, in-memory for local dev.
 *
 * Mirrors the push-token / webhook-dedupe pattern: callers pass the Redis
 * client when one is configured (release always has one — app.ts refuses to
 * boot a release without REDIS_URL) and `null` in local dev, where state
 * lives in process memory instead.
 *
 * Each store keeps its whole state under one Redis key. Updates are atomic
 * read-modify-write: the mutated state is written back with a compare-and-swap
 * Lua script and retried when a concurrent writer got there first, so no
 * update is ever lost across machines.
 */

export type SharedStateRedis = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<string | null>;
  eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown>;
};

// Placeholder for "the key does not exist yet" in the compare-and-swap call,
// since a missing key has no previous value to compare against.
const MISSING_STATE = '__regents_shared_state_missing__';

// GET/SET as one atomic step: write only when the value is still exactly what
// this writer read (or the key is still missing when it read nothing).
const COMPARE_AND_SWAP_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if (current == false and ARGV[1] == ARGV[3]) or current == ARGV[1] then
  redis.call('SET', KEYS[1], ARGV[2])
  return 1
end
return 0
`;

// Conflicts only happen when two machines mutate the same store in the same
// instant; a bounded retry keeps a pathological hot loop from spinning forever.
const MAX_UPDATE_ATTEMPTS = 20;

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createSharedStateStore<T extends object>(redisKey: string, createInitialState: () => T) {
  let localState: T = createInitialState();

  async function read(redis?: SharedStateRedis | null): Promise<T> {
    if (redis) {
      const raw = await redis.get(redisKey);
      return raw ? (JSON.parse(raw) as T) : createInitialState();
    }

    return cloneJson(localState);
  }

  async function update(mutator: (state: T) => void, redis?: SharedStateRedis | null): Promise<T> {
    if (!redis) {
      const nextState = cloneJson(localState);
      mutator(nextState);
      localState = nextState;
      return cloneJson(nextState);
    }

    for (let attempt = 1; attempt <= MAX_UPDATE_ATTEMPTS; attempt += 1) {
      const raw = await redis.get(redisKey);
      const state = raw ? (JSON.parse(raw) as T) : createInitialState();
      mutator(state);
      const serialized = JSON.stringify(state);

      const swapped = await redis.eval(COMPARE_AND_SWAP_SCRIPT, {
        keys: [redisKey],
        arguments: [raw ?? MISSING_STATE, serialized, MISSING_STATE],
      });
      if (Number(swapped) === 1) {
        return JSON.parse(serialized) as T;
      }
    }

    throw new Error(`Shared state update for ${redisKey} kept conflicting with concurrent writers.`);
  }

  async function reset(redis?: SharedStateRedis | null, nextState = createInitialState()): Promise<T> {
    if (redis) {
      await redis.set(redisKey, JSON.stringify(nextState));
      return cloneJson(nextState);
    }

    localState = cloneJson(nextState);
    return cloneJson(nextState);
  }

  return { read, update, reset };
}
