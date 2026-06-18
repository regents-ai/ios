import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  getMobileRegentStateFilePathForTests,
  prepareWalletActionForUser,
  resetMobileRegentStateForTests,
} from '../server/src/mobileRegents.js';

beforeEach(() => {
  resetMobileRegentStateForTests();
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

function trackedActionIds() {
  const state = JSON.parse(readFileSync(getMobileRegentStateFilePathForTests(), 'utf8')) as {
    preparedWalletActions: Record<string, { action_id: string }>;
  };

  return new Set(Object.values(state.preparedWalletActions).map((action) => action.action_id));
}

test('preparing twice with the same idempotency key reuses the tracked action', () => {
  const first = prepareWalletActionForUser('funding-user', 'funding', walletActionInput('funding-key-1'));
  const second = prepareWalletActionForUser('funding-user', 'funding', walletActionInput('funding-key-1'));

  assert.ok(first);
  assert.ok(second);
  assert.equal(second.action_id, first.action_id);
  assert.equal(second.expires_at, first.expires_at);
  assert.equal(trackedActionIds().size, 1);
});

test('a different idempotency key creates a new tracked action', () => {
  const first = prepareWalletActionForUser('funding-user', 'funding', walletActionInput('funding-key-1'));
  const other = prepareWalletActionForUser('funding-user', 'funding', walletActionInput('funding-key-2'));

  assert.ok(first);
  assert.ok(other);
  assert.notEqual(other.action_id, first.action_id);
  assert.equal(trackedActionIds().size, 2);
});
