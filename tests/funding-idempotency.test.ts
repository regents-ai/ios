import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  prepareWalletActionForUser,
  readMobileRegentStateForTests,
  resetMobileRegentStateForTests,
} from '../server/src/mobileRegents.js';

/**
 * In-memory stand-in for the release Redis client, mirroring the fake used by
 * server/src/mobileRoutes.test.ts. `eval` implements the same compare-and-swap
 * semantics as the Lua script in sharedStateStore.ts.
 */
function createFakeSharedStateRedis() {
  const store = new Map<string, string>();
  return {
    store,
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async set(key: string, value: string) {
      store.set(key, value);
      return 'OK';
    },
    async eval(_script: string, options: { keys: string[]; arguments: string[] }) {
      const key = options.keys[0] ?? '';
      const [expected, next, missingSentinel] = options.arguments;
      const current = store.get(key);
      if ((current === undefined && expected === missingSentinel) || current === expected) {
        store.set(key, next ?? '');
        return 1;
      }
      return 0;
    },
  };
}

let redis = createFakeSharedStateRedis();

beforeEach(async () => {
  redis = createFakeSharedStateRedis();
  await resetMobileRegentStateForTests(redis);
});

function walletActionInput(idempotencyKey: string) {
  return {
    regentId: 'atlas-capital',
    expectedSigner: '0x1111111111111111111111111111111111111111',
    to: '0x2222222222222222222222222222222222222222',
    value: '0',
    data: '0xabcdef',
    riskCopy: 'You are preparing a wallet action for review before signing.',
    idempotencyKey,
    amount: '25',
    currency: 'USDC',
  };
}

async function trackedActionIds() {
  const state = await readMobileRegentStateForTests(redis);

  return new Set(Object.values(state.preparedWalletActions).map((action) => action.action_id));
}

test('preparing twice with the same idempotency key reuses the tracked action', async () => {
  const first = await prepareWalletActionForUser('funding-user', 'funding', walletActionInput('funding-key-1'), redis);
  const second = await prepareWalletActionForUser('funding-user', 'funding', walletActionInput('funding-key-1'), redis);

  assert.ok(first);
  assert.ok(second);
  assert.equal(second.action_id, first.action_id);
  assert.equal(second.expires_at, first.expires_at);
  assert.equal((await trackedActionIds()).size, 1);
});

test('a different idempotency key creates a new tracked action', async () => {
  const first = await prepareWalletActionForUser('funding-user', 'funding', walletActionInput('funding-key-1'), redis);
  const other = await prepareWalletActionForUser('funding-user', 'funding', walletActionInput('funding-key-2'), redis);

  assert.ok(first);
  assert.ok(other);
  assert.notEqual(other.action_id, first.action_id);
  assert.equal((await trackedActionIds()).size, 2);
});
