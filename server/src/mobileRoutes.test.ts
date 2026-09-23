import assert from 'node:assert/strict';
import test from 'node:test';
import type { Request, Response } from 'express';
import { decodeFunctionData, erc20Abi, parseUnits } from 'viem';

import type { BasePortfolioReader } from './basePortfolio.js';
import { createMobileRoutes } from './mobileRoutes.js';
import { REGENT_STAKING_ADDRESS, REGENT_TOKEN_ADDRESS, regentRevenueStakingAbi } from './regentStaking.js';

async function requestStakingRoute(
  input: { method: 'GET' | 'POST'; url: string; body?: unknown },
  routes = createMobileRoutes(),
) {
  const router = routes as unknown as {
    handle(request: Request, response: Response, next: (error?: unknown) => void): void;
  };

  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    let statusCode = 200;
    const request = {
      method: input.method,
      url: input.url,
      originalUrl: input.url,
      path: input.url.split('?')[0],
      headers: {},
      body: input.body,
      query: {},
      header() {
        return undefined;
      },
      get() {
        return undefined;
      },
    } as unknown as Request;
    const response = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(payload: unknown) {
        resolve({ status: statusCode, body: payload });
        return this;
      },
      setHeader() {
        return this;
      },
      req: request,
    } as unknown as Response;

    router.handle(request, response, (error?: unknown) => reject(error ?? new Error('unhandled route')));
  });
}

// Invariant: every prepared staking call targets the Base staking contract,
// calls the intended function, and names the signed-in wallet as both signer
// and recipient. Nothing else about staking is worth an automated test.
test('prepared staking calls target the staking contract with the wallet as signer and recipient', async () => {
  const wallet = '0x9fa152B0EAdbFe9A7c5C0a8e1D11784f22669a3e';
  const amount = parseUnits('12.5', 18);
  const cases = [
    ['stake', { walletAddress: wallet, amount: '12.5' }, 'stake', [amount, wallet]],
    ['unstake', { walletAddress: wallet, amount: '12.5' }, 'unstake', [amount, wallet]],
    ['claim-usdc', { walletAddress: wallet }, 'claimUSDC', [wallet]],
    ['claim-regent', { walletAddress: wallet }, 'claimRegent', [wallet]],
    ['claim-and-restake-regent', { walletAddress: wallet }, 'claimAndRestakeRegent', undefined],
  ] as const;

  for (const [path, body, functionName, args] of cases) {
    const response = await requestStakingRoute({
      method: 'POST',
      url: `/mobile/regent/staking/${path}`,
      body,
    });

    assert.equal(response.status, 200, path);
    const walletAction = response.body.wallet_action;
    assert.equal(walletAction.to, REGENT_STAKING_ADDRESS);
    assert.equal(walletAction.expected_signer, wallet);
    assert.equal(walletAction.chain_id, 8453);
    assert.equal(walletAction.value, '0');

    const decoded = decodeFunctionData({ abi: regentRevenueStakingAbi, data: walletAction.data });
    assert.equal(decoded.functionName, functionName);
    assert.deepEqual(decoded.args, args);

    if (path === 'stake') {
      const approval = decodeFunctionData({ abi: erc20Abi, data: walletAction.approval.data });
      assert.equal(walletAction.approval.token, REGENT_TOKEN_ADDRESS);
      assert.equal(walletAction.approval.spender, REGENT_STAKING_ADDRESS);
      assert.equal(walletAction.approval.amount, amount.toString());
      assert.equal(approval.functionName, 'approve');
      assert.deepEqual(approval.args, [REGENT_STAKING_ADDRESS, amount]);
    } else {
      assert.equal(walletAction.approval, undefined);
    }
  }

  const rejected = await requestStakingRoute({
    method: 'POST',
    url: '/mobile/regent/staking/stake',
    body: { walletAddress: wallet, amount: '0' },
  });
  assert.equal(rejected.status, 400);
});

const holdings = (wallet: string) => ({
  wallet_address: wallet as `0x${string}`,
  eth_balance: '0.01',
  usdc_balance: '12.5',
  regent_balance: '100',
  staked_regent: '50',
  claimable_usdc: '0.25',
  claimable_regent: '1',
});

test('the portfolio route reads the listed wallets and refuses an empty, long or malformed list', async () => {
  const walletA = '0x9fa152B0EAdbFe9A7c5C0a8e1D11784f22669a3e';
  const walletB = '0x6f89bcA4eA5931EdFCB09786267b251DeE752b07';
  const requested: string[][] = [];
  const readPortfolio: BasePortfolioReader = async (wallets) => {
    requested.push(wallets);
    return { kind: 'ok', portfolio: { chain_id: 8453, block_number: 7, wallets: wallets.map(holdings) } };
  };
  const routes = createMobileRoutes({ readPortfolio });

  const ok = await requestStakingRoute({ method: 'GET', url: `/mobile/portfolio?wallets=${walletA},${walletB}` }, routes);
  assert.equal(ok.status, 200);
  assert.deepEqual(requested, [[walletA, walletB]]);
  assert.deepEqual(ok.body, { portfolio: { chain_id: 8453, block_number: 7, wallets: [holdings(walletA), holdings(walletB)] } });

  const six = Array.from({ length: 6 }, (_, index) => `0x${String(index + 1).repeat(40)}`).join(',');
  for (const query of ['', '?wallets=', `?wallets=${six}`, '?wallets=0x1234', `?wallets=${walletA},`]) {
    const refused = await requestStakingRoute({ method: 'GET', url: `/mobile/portfolio${query}` }, routes);
    assert.equal(refused.status, 400, query);
  }
  assert.equal(requested.length, 1);
});

test('the portfolio route answers in plain words when Base cannot be read', async () => {
  const wallet = '0x9fa152B0EAdbFe9A7c5C0a8e1D11784f22669a3e';
  const missing = await requestStakingRoute(
    { method: 'GET', url: `/mobile/portfolio?wallets=${wallet}` },
    createMobileRoutes({ readPortfolio: async () => ({ kind: 'missing_rpc', requiredEnv: 'BASE_RPC_URL' }) }),
  );
  assert.equal(missing.status, 503);
  assert.equal(missing.body.error.message, 'Balances are unavailable right now.');

  const failed = await requestStakingRoute(
    { method: 'GET', url: `/mobile/portfolio?wallets=${wallet}` },
    createMobileRoutes({ readPortfolio: async () => ({ kind: 'rpc_error', name: 'HttpRequestError' }) }),
  );
  assert.equal(failed.status, 502);
  assert.equal(failed.body.error.message, 'Balances could not be read from Base right now.');
});
