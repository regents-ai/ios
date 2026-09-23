import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decodeFunctionData,
  encodeAbiParameters,
  encodeEventTopics,
  erc20Abi,
  type Address,
  type Log,
} from 'viem';

import { prepareUsdcTransfer, receiptPaysExactly, type TransferReceipt } from './baseUsdcTransfers.js';
import { BASE_USDC_ADDRESS } from './regentStaking.js';

const PAYER: Address = '0x4B0897b0513fdC7C541B6d9D7E929C4e5364D2dB';
const AGENT: Address = '0x9fa152B0EAdbFe9A7c5C0a8e1D11784f22669a3e';
const STRANGER: Address = '0x1111111111111111111111111111111111111111';
const ENTRY_POINT: Address = '0x0000000071727De22E5E9d8BAf0edAc6f37da032';
const OTHER_TOKEN: Address = '0x6f89bcA4eA5931EdFCB09786267b251DeE752b07';
const AMOUNT = 5_000_000n;

let logIndex = 0;
function logAt(address: Address, topics: Log['topics'], data: `0x${string}`): Log {
  logIndex += 1;
  return {
    address,
    topics,
    data,
    blockHash: '0x5b2e2c5a6c1d0f7dbb1f0f8a8d51b3de0d5f55e1ad2e6b3c42c2b9f6d8f6b0a1',
    blockNumber: 36_123_456n,
    logIndex,
    transactionHash: '0x8c1f6f0c4f5b1b6f3a2e9d7c5b3a19f7e5d3c1b9a7f5e3d1c9b7a5f3e1d9c7b5',
    transactionIndex: 3,
    removed: false,
  };
}

function transferLog(token: Address, from: Address, to: Address, value: bigint): Log {
  return logAt(
    token,
    encodeEventTopics({ abi: erc20Abi, eventName: 'Transfer', args: { from, to } }) as Log['topics'],
    encodeAbiParameters([{ type: 'uint256' }], [value]),
  );
}

/** A smart-account bundle: the EntryPoint's own logs around the payment the user operation made. */
function bundleReceipt(paymentLogs: Log[], status: TransferReceipt['status'] = 'success'): TransferReceipt {
  const entryPointLog = logAt(
    ENTRY_POINT,
    ['0x49628fd1471006c1482da88028e9ce4dbb080b815c9b0344d39e5a8e6ec1419f', `0x${'ab'.repeat(32)}`],
    encodeAbiParameters([{ type: 'uint256' }, { type: 'bool' }], [1n, true]),
  );
  return { status, logs: [entryPointLog, ...paymentLogs, entryPointLog] };
}

const payment = { from: PAYER, to: AGENT, amountRaw: AMOUNT };

// Invariant: a request counts as paid only when Base shows a successful
// transaction carrying a USDC Transfer from the paying wallet to the
// requested address for exactly the requested amount.
test('a matching USDC Transfer log proves the payment', () => {
  assert.equal(receiptPaysExactly(bundleReceipt([transferLog(BASE_USDC_ADDRESS, PAYER, AGENT, AMOUNT)]), payment), true);
  // Addresses compare without regard to letter case.
  assert.equal(
    receiptPaysExactly(bundleReceipt([transferLog(BASE_USDC_ADDRESS, PAYER, AGENT, AMOUNT)]), {
      ...payment,
      from: PAYER.toLowerCase() as Address,
      to: AGENT.toUpperCase().replace('0X', '0x') as Address,
    }),
    true,
  );
  // Other Transfers in the same transaction do not hide the matching one.
  assert.equal(
    receiptPaysExactly(
      bundleReceipt([
        transferLog(BASE_USDC_ADDRESS, PAYER, STRANGER, 1n),
        transferLog(BASE_USDC_ADDRESS, PAYER, AGENT, AMOUNT),
      ]),
      payment,
    ),
    true,
  );
});

test('a transaction that does not pay the request exactly is refused', () => {
  const refused = (logs: Log[], status: TransferReceipt['status'] = 'success') =>
    assert.equal(receiptPaysExactly(bundleReceipt(logs, status), payment), false);

  refused([transferLog(BASE_USDC_ADDRESS, PAYER, AGENT, AMOUNT - 1n)]);
  refused([transferLog(BASE_USDC_ADDRESS, PAYER, AGENT, AMOUNT + 1n)]);
  refused([transferLog(BASE_USDC_ADDRESS, PAYER, STRANGER, AMOUNT)]);
  refused([transferLog(BASE_USDC_ADDRESS, STRANGER, AGENT, AMOUNT)]);
  refused([transferLog(OTHER_TOKEN, PAYER, AGENT, AMOUNT)]);
  refused([transferLog(BASE_USDC_ADDRESS, PAYER, AGENT, AMOUNT)], 'reverted');
  // A bundle whose user operation failed carries no Transfer at all.
  refused([]);
});

test('paying prepares one USDC transfer signed by the declared wallet', () => {
  const action = prepareUsdcTransfer({ requestId: 'req-1', walletAddress: PAYER, recipient: AGENT, amountRaw: AMOUNT });

  assert.equal(action.action, 'pay');
  assert.equal(action.chain_id, 8453);
  assert.equal(action.to, BASE_USDC_ADDRESS);
  assert.equal(action.value, '0');
  assert.equal(action.expected_signer, PAYER);
  assert.equal(action.amount_raw, '5000000');
  const decoded = decodeFunctionData({ abi: erc20Abi, data: action.data });
  assert.equal(decoded.functionName, 'transfer');
  assert.deepEqual(decoded.args, [AGENT, AMOUNT]);
});
