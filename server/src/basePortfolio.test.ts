import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import {
  decodeFunctionData,
  encodeFunctionResult,
  erc20Abi,
  multicall3Abi,
  parseUnits,
  type Address,
  type Hex,
} from 'viem';

import { readBasePortfolio } from './basePortfolio.js';
import { BASE_USDC_ADDRESS, REGENT_STAKING_ADDRESS, REGENT_TOKEN_ADDRESS, regentRevenueStakingAbi } from './regentStaking.js';

const walletA: Address = '0x1111111111111111111111111111111111111111';
const walletB: Address = '0x2222222222222222222222222222222222222222';

/**
 * Atomic amount a stub Base answers for one figure: the wallet's position in
 * the request picks the whole number, so a mixed-up wallet shows at once.
 */
function stubAmount(wallet: Address, figure: 'eth' | 'usdc' | 'regent' | 'staked' | 'claimable_usdc' | 'claimable_regent') {
  const whole = wallet === walletA ? '1' : '2';
  switch (figure) {
    case 'eth':
      return parseUnits(`${whole}.5`, 18);
    case 'usdc':
      return parseUnits(`${whole}0.25`, 6);
    case 'regent':
      return parseUnits(`${whole}00`, 18);
    case 'staked':
      return parseUnits(`${whole}000`, 18);
    case 'claimable_usdc':
      return parseUnits(`${whole}.75`, 6);
    case 'claimable_regent':
      return parseUnits(`${whole}.125`, 18);
  }
}

function answerCall(target: Address, callData: Hex): bigint {
  const lower = target.toLowerCase();
  if (lower === REGENT_STAKING_ADDRESS.toLowerCase()) {
    const call = decodeFunctionData({ abi: regentRevenueStakingAbi, data: callData });
    const wallet = call.args![0] as Address;
    if (call.functionName === 'stakedBalance') return stubAmount(wallet, 'staked');
    if (call.functionName === 'previewClaimableUSDC') return stubAmount(wallet, 'claimable_usdc');
    if (call.functionName === 'previewClaimableRegent') return stubAmount(wallet, 'claimable_regent');
  }
  if (lower === BASE_USDC_ADDRESS.toLowerCase() || lower === REGENT_TOKEN_ADDRESS.toLowerCase()) {
    const call = decodeFunctionData({ abi: erc20Abi, data: callData });
    const wallet = call.args![0] as Address;
    return stubAmount(wallet, lower === BASE_USDC_ADDRESS.toLowerCase() ? 'usdc' : 'regent');
  }
  const call = decodeFunctionData({ abi: multicall3Abi, data: callData });
  if (call.functionName === 'getEthBalance') return stubAmount(call.args[0] as Address, 'eth');
  throw new Error(`unexpected call to ${target}`);
}

/** A local JSON-RPC endpoint that answers like Base for the portfolio read. */
async function withStubBase(run: (rpcUrl: string, ethCalls: () => number) => Promise<void>) {
  let ethCalls = 0;
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const request = JSON.parse(body) as { id: number; method: string; params: [{ data: Hex }] };
      let result: Hex;
      if (request.method === 'eth_blockNumber') {
        result = '0x2faf080';
      } else if (request.method === 'eth_call') {
        ethCalls += 1;
        const aggregate = decodeFunctionData({ abi: multicall3Abi, data: request.params[0].data });
        const calls = aggregate.args[0] as readonly { target: Address; callData: Hex }[];
        result = encodeFunctionResult({
          abi: multicall3Abi,
          functionName: 'aggregate3',
          result: calls.map((call) => ({
            success: true,
            returnData: encodeFunctionResult({ abi: erc20Abi, functionName: 'balanceOf', result: answerCall(call.target, call.callData) }),
          })),
        });
      } else {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'not stubbed' } }));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, () => ethCalls);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test('each wallet gets its own balances and staking position from one Base call', async () => {
  await withStubBase(async (rpcUrl, ethCalls) => {
    const result = await readBasePortfolio([walletA, walletB], rpcUrl);

    assert.equal(result.kind, 'ok');
    assert.equal(ethCalls(), 1);
    assert.deepEqual(result.kind === 'ok' && result.portfolio, {
      chain_id: 8453,
      block_number: 50_000_000,
      wallets: [
        {
          wallet_address: walletA,
          eth_balance: '1.5',
          usdc_balance: '10.25',
          regent_balance: '100',
          staked_regent: '1000',
          claimable_usdc: '1.75',
          claimable_regent: '1.125',
        },
        {
          wallet_address: walletB,
          eth_balance: '2.5',
          usdc_balance: '20.25',
          regent_balance: '200',
          staked_regent: '2000',
          claimable_usdc: '2.75',
          claimable_regent: '2.125',
        },
      ],
    });
  });
});

test('a portfolio read without a Base RPC names the missing setting', async () => {
  assert.deepEqual(await readBasePortfolio([walletA], ''), { kind: 'missing_rpc', requiredEnv: 'BASE_RPC_URL' });
});
