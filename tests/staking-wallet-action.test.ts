import test from 'node:test';
import assert from 'node:assert/strict';

import { PlatformWalletAction } from '../types/regents';
import {
  hasPositiveRawAmount,
  shouldRequestApprovalForAllowance,
  stakingActionCall,
  stakingApprovalCall,
  stakingNetworkForChain,
} from '../utils/onchain/stakingWalletAction';

const expectedSigner = '0x1111111111111111111111111111111111111111';
const stakingContract = '0x2222222222222222222222222222222222222222';
const regentToken = '0x3333333333333333333333333333333333333333';

function platformWalletAction(overrides: Partial<PlatformWalletAction> = {}): PlatformWalletAction {
  return {
    action_id: 'stake-action',
    owner_product: 'platform',
    resource: 'regent_staking',
    resource_id: stakingContract,
    action: 'stake',
    chain_id: 8453,
    to: stakingContract,
    value: '0',
    data: '0xabcd',
    expected_signer: expectedSigner,
    expires_at: '2026-12-31T00:00:00.000Z',
    idempotency_key: 'stake-key',
    simulation: {
      required: false,
      status: 'not_required',
      block_number: null,
    },
    risk_copy: 'Review this staking action before signing.',
    approval: {
      token: regentToken,
      spender: stakingContract,
      amount: '2000000000000000000',
      data: '0xef12',
    },
    ...overrides,
  };
}

test('staking actions use only the current Base networks', () => {
  assert.equal(stakingNetworkForChain(8453), 'base');
  assert.equal(stakingNetworkForChain(84532), 'base-sepolia');
  assert.throws(() => stakingNetworkForChain(1), /network used by REGENT staking/);
});

test('claim buttons use raw claimable balances', () => {
  assert.equal(hasPositiveRawAmount('1'), true);
  assert.equal(hasPositiveRawAmount('0'), false);
  assert.equal(hasPositiveRawAmount(null), false);
  assert.equal(hasPositiveRawAmount('not-a-number'), false);
});

test('approval decision compares current allowance to Platform required amount', () => {
  assert.equal(shouldRequestApprovalForAllowance({ allowance: 1n, requiredAmount: '2' }), true);
  assert.equal(shouldRequestApprovalForAllowance({ allowance: 2n, requiredAmount: '2' }), false);
  assert.equal(shouldRequestApprovalForAllowance({ allowance: 3n, requiredAmount: '2' }), false);
  assert.throws(
    () => shouldRequestApprovalForAllowance({ allowance: 0n, requiredAmount: '-1' }),
    /Refresh staking/
  );
});

test('staking call validation preserves signer, chain, address, value, and calldata checks', () => {
  assert.deepEqual(stakingActionCall(platformWalletAction(), expectedSigner), {
    to: stakingContract,
    value: 0n,
    data: '0xabcd',
  });

  assert.throws(
    () => stakingActionCall(platformWalletAction({ expected_signer: '0x4444444444444444444444444444444444444444' }), expectedSigner),
    /wallet that will sign/
  );
  assert.throws(() => stakingActionCall(platformWalletAction({ chain_id: 1 }), expectedSigner), /network used/);
  assert.throws(() => stakingActionCall(platformWalletAction({ data: '0xabc' }), expectedSigner), /Refresh staking/);
  assert.throws(() => stakingActionCall(platformWalletAction({ value: '-1' }), expectedSigner), /Refresh staking/);
});

test('approval call is present only when Platform sends approval data', () => {
  assert.deepEqual(stakingApprovalCall(platformWalletAction(), expectedSigner), {
    to: regentToken,
    value: 0n,
    data: '0xef12',
  });

  assert.equal(stakingApprovalCall(platformWalletAction({ approval: undefined }), expectedSigner), null);
});
