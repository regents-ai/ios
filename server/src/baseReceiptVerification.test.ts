import assert from 'node:assert/strict';
import test from 'node:test';

import { verifyBaseReceipt } from './baseReceiptVerification.js';

function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    json: async () => body,
  } as Response;
}

test('Base receipt verification reports the exact missing RPC setting', async () => {
  const result = await verifyBaseReceipt(`0x${'1'.repeat(64)}`, fetch, '');

  assert.deepEqual(result, { kind: 'missing_rpc', requiredEnv: 'BASE_RPC_URL' });
});

test('Base receipt verification accepts confirmed Base receipts', async () => {
  const calls: unknown[] = [];
  const fakeFetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    calls.push(JSON.parse(String(init?.body)));
    if (calls.length === 1) {
      return jsonResponse({ result: '0x2105' });
    }
    if (calls.length === 2) {
      return jsonResponse({
        result: {
          transactionHash: `0x${'2'.repeat(64)}`,
          status: '0x1',
          blockNumber: '0x1c00000',
        },
      });
    }

    return jsonResponse({
      result: {
        from: '0x1111111111111111111111111111111111111111',
        to: '0x2222222222222222222222222222222222222222',
        value: '0x0',
        input: '0x1234',
      },
    });
  }) as typeof fetch;

  const result = await verifyBaseReceipt(`0x${'2'.repeat(64)}`, fakeFetch, 'https://base.example');

  assert.equal(result.kind, 'confirmed');
  if (result.kind === 'confirmed') {
    assert.equal(result.receipt.chainId, 8453);
    assert.equal(result.receipt.status, 'confirmed');
    assert.equal(result.receipt.blockNumber, 29360128);
    assert.equal(result.receipt.from, '0x1111111111111111111111111111111111111111');
    assert.equal(result.receipt.to, '0x2222222222222222222222222222222222222222');
    assert.equal(result.receipt.value, '0');
    assert.equal(result.receipt.data, '0x1234');
  }
});

test('Base receipt verification rejects non-Base RPC responses', async () => {
  const fakeFetch = (async () => jsonResponse({ result: '0x1' })) as typeof fetch;

  const result = await verifyBaseReceipt(`0x${'3'.repeat(64)}`, fakeFetch, 'https://ethereum.example');

  assert.equal(result.kind, 'rpc_error');
});

test('Base receipt verification keeps pending receipts unconfirmed', async () => {
  let callCount = 0;
  const fakeFetch = (async () => {
    callCount += 1;
    return callCount === 1
      ? jsonResponse({ result: '0x2105' })
      : jsonResponse({ result: null });
  }) as typeof fetch;

  const result = await verifyBaseReceipt(`0x${'4'.repeat(64)}`, fakeFetch, 'https://base.example');

  assert.equal(result.kind, 'not_confirmed');
});

test('Base receipt verification keeps receipts without transaction proof unconfirmed', async () => {
  let callCount = 0;
  const fakeFetch = (async () => {
    callCount += 1;
    if (callCount === 1) {
      return jsonResponse({ result: '0x2105' });
    }
    if (callCount === 2) {
      return jsonResponse({
        result: {
          transactionHash: `0x${'5'.repeat(64)}`,
          status: '0x1',
          blockNumber: '0x1c00000',
        },
      });
    }

    return jsonResponse({ result: null });
  }) as typeof fetch;

  const result = await verifyBaseReceipt(`0x${'5'.repeat(64)}`, fakeFetch, 'https://base.example');

  assert.equal(result.kind, 'not_confirmed');
});
