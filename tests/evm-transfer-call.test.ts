import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeFunctionData, parseEther, parseUnits, zeroAddress } from 'viem';

import { buildEvmTransferCall, isNativeEvmToken } from '../utils/onchain/buildTransferCall';

const recipient = '0x1111111111111111111111111111111111111111';
const usdc = '0x2222222222222222222222222222222222222222';

const erc20TransferAbi = [
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

test('builds a USDC transfer call with ABI encoding', () => {
  const call = buildEvmTransferCall({
    recipientAddress: recipient,
    amountDecimal: '12.345678',
    tokenAddress: usdc,
    decimals: 6,
  });

  assert.equal(call.to, usdc);
  assert.equal(call.value, 0n);

  const decoded = decodeFunctionData({
    abi: erc20TransferAbi,
    data: call.data,
  });

  assert.equal(decoded.functionName, 'transfer');
  assert.deepEqual(decoded.args, [recipient, parseUnits('12.345678', 6)]);
});

test('builds a native ETH transfer call', () => {
  const call = buildEvmTransferCall({
    recipientAddress: recipient,
    amountDecimal: '0.05',
    tokenAddress: null,
  });

  assert.deepEqual(call, {
    to: recipient,
    value: parseEther('0.05'),
    data: '0x',
  });
});

test('recognizes current native token sentinel addresses', () => {
  assert.equal(isNativeEvmToken(undefined), true);
  assert.equal(isNativeEvmToken(zeroAddress), true);
  assert.equal(isNativeEvmToken('0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'), true);
  assert.equal(isNativeEvmToken(usdc), false);
});

test('rejects invalid EVM recipients', () => {
  assert.throws(
    () =>
      buildEvmTransferCall({
        recipientAddress: 'not-a-wallet',
        amountDecimal: '1',
        tokenAddress: usdc,
        decimals: 6,
      }),
    /valid Base or Ethereum address/
  );
});
