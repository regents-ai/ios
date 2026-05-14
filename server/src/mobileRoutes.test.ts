import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test, { beforeEach } from 'node:test';
import type { Request, Response } from 'express';
import { encodeFunctionData, parseUnits } from 'viem';

import {
  confirmPreparedWalletActionForUser,
  confirmRegentFundingIntentForUser,
  confirmRegentReturnRequestForUser,
  createRegentFundingIntentForUser,
  createRegentReturnRequestForUser,
  getRegentFundingIntentForUser,
  getMobileRegentStateFilePathForTests,
  getRegentManagerForUserFromPlatformProjection,
  getRegentForUserFromPlatformProjection,
  listRegentsForUserFromPlatformProjection,
  prepareWalletActionForUser,
  resetMobileRegentStateForTests,
} from './mobileRegents.js';
import { createMobileRoutes } from './mobileRoutes.js';
import {
  createTerminalSession,
  getTerminalEvents,
  listTerminalSessions,
  postTerminalMessage,
  resolveTerminalApproval,
} from './mobileTerminal.js';
import {
  createPlatformStakingClient,
  type PlatformProjection,
  type PlatformRwrClient,
  type PlatformStakingClient,
} from './platformProjection.js';

beforeEach(() => {
  resetMobileRegentStateForTests();
});

function listRoutePaths() {
  const router = createMobileRoutes();

  return router.stack.map((layer) => layer.route?.path).filter((path): path is string => typeof path === 'string');
}

const platformProjection: PlatformProjection = {
  formation: {
    formation_state: {
      state: 'ready',
      blockers: [{ message: 'Confirm launch budget.' }],
    },
  },
  billing_account: {
    status: 'prepaid',
    runtime_credit_balance_usd_cents: 5025,
  },
  billing_usage: {
    runtime_credit_balance_usd_cents: 5025,
  },
  companies: [
    {
      company: {
        id: 101,
        name: 'Atlas Capital',
        slug: 'atlas-capital',
        claimed_label: 'Atlas Capital',
        basename_fqdn: 'atlas.regents.sh',
        status: 'active',
        wallet_address: '0x7aA4fB65E3A74F4797e95aA8ef1Fd54e9b3D0812',
        runtime_status: 'ready',
        workspace_url: 'https://atlas.regents.sh',
        sprite_free_until: null,
      },
      runtime: {
        sprite: {
          status: 'ready',
          free_until: null,
        },
        workspace: {
          status: 'ready',
        },
        hermes: {
          status: 'ready',
        },
      },
      formation: {
        status: 'ready',
        last_error_message: null,
      },
      public_profile: {
        slug: 'atlas-capital',
        basename_fqdn: 'atlas.regents.sh',
      },
    },
  ],
  public_profiles: [
    {
      slug: 'atlas-capital',
      basename_fqdn: 'atlas.regents.sh',
    },
  ],
};

function publicSlugProjection() {
  return {
    ...platformProjection,
    companies: platformProjection.companies.map((company) => ({
      ...company,
      company: {
        ...company.company,
        slug: 'atlas-internal',
      },
      public_profile: {
        ...company.public_profile,
        slug: 'atlas-public',
      },
    })),
    public_profiles: platformProjection.public_profiles.map((profile) => ({
      ...profile,
      slug: 'atlas-public',
    })),
  } satisfies PlatformProjection;
}

async function requestMobileRoute(
  projection: PlatformProjection,
  input: {
    method: 'GET' | 'POST';
    url: string;
    headers?: Record<string, string>;
    body?: unknown;
  },
  clients?: Parameters<typeof createMobileRoutes>[0],
) {
  const router = createMobileRoutes({
    platformProjectionClient: {
      async fetchProjection() {
        return { kind: 'ok' as const, projection };
      },
    },
    ...clients,
  }) as unknown as {
    handle(request: Request, response: Response, next: (error?: unknown) => void): void;
  };

  const headers = Object.fromEntries(
    Object.entries(input.headers || {}).map(([name, value]) => [name.toLowerCase(), value]),
  );

  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    let resolved = false;
    let statusCode = 200;
    let responseBody: any;
    const responseHeaders: Record<string, string> = {};
    const finish = () => {
      if (!resolved) {
        resolved = true;
        resolve({ status: statusCode, body: responseBody });
      }
    };

    const request = {
      method: input.method,
      url: input.url,
      originalUrl: input.url,
      path: input.url.split('?')[0],
      headers,
      body: input.body,
      query: {},
      header(name: string) {
        return headers[name.toLowerCase()];
      },
      get(name: string) {
        return headers[name.toLowerCase()];
      },
    } as unknown as Request;
    const response = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(payload: unknown) {
        responseBody = payload;
        finish();
        return this;
      },
      send(payload: unknown) {
        responseBody = payload;
        finish();
        return this;
      },
      end(payload?: unknown) {
        responseBody = responseBody ?? payload;
        finish();
        return this;
      },
      setHeader(name: string, value: string | number | readonly string[]) {
        responseHeaders[name.toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value);
        return this;
      },
      getHeader(name: string) {
        return responseHeaders[name.toLowerCase()];
      },
      req: request,
    } as unknown as Response;

    router.handle(request, response, (error?: unknown) => {
      if (error) {
        reject(error);
        return;
      }
      finish();
    });
  });
}

const expectedSigner = '0x1111111111111111111111111111111111111111';
const expectedRecipient = '0x2222222222222222222222222222222222222222';
const expectedFundingToken = '0x3333333333333333333333333333333333333333';
const expectedData = '0x';
const stakingContract = '0x9999999999999999999999999999999999999999';
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

function fundingTransferData(input?: { recipient?: `0x${string}`; amount?: string }) {
  return encodeFunctionData({
    abi: erc20TransferAbi,
    functionName: 'transfer',
    args: [input?.recipient ?? expectedRecipient, parseUnits(input?.amount ?? '25', 6)],
  });
}

const stakingState = {
  chain_id: 8453,
  chain_label: 'Base',
  contract_address: stakingContract,
  owner_address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  stake_token_address: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  usdc_address: '0xcccccccccccccccccccccccccccccccccccccccc',
  treasury_recipient: '0xdddddddddddddddddddddddddddddddddddddddd',
  revenue_share_supply_denominator_raw: '1000000000000000000',
  revenue_share_supply_denominator: '1',
  paused: false,
  total_staked_raw: '1500000000000000000000',
  total_staked: '1500',
  total_usdc_received_raw: '25000000',
  total_usdc_received: '25',
  direct_deposit_usdc_raw: '1000000',
  direct_deposit_usdc: '1',
  treasury_residual_usdc_raw: '2000000',
  treasury_residual_usdc: '2',
  materialized_outstanding_raw: '3000000000000000000',
  materialized_outstanding: '3',
  available_reward_inventory_raw: '4000000000000000000',
  available_reward_inventory: '4',
  total_claimed_so_far_raw: '5000000000000000000',
  total_claimed_so_far: '5',
  wallet_address: expectedSigner,
  connected_wallet_address: expectedSigner,
  wallet_stake_balance_raw: '12000000000000000000',
  wallet_stake_balance: '12',
  wallet_token_balance_raw: '42000000000000000000',
  wallet_token_balance: '42',
  wallet_claimable_usdc_raw: '7000000',
  wallet_claimable_usdc: '7',
  wallet_claimable_regent_raw: '9000000000000000000',
  wallet_claimable_regent: '9',
  wallet_funded_claimable_regent_raw: '9000000000000000000',
  wallet_funded_claimable_regent: '9',
};

function stakingAction(action: 'stake' | 'unstake' | 'claim_usdc' | 'claim_regent' | 'claim_and_restake_regent') {
  return {
    staking: {
      chain_id: 8453,
      chain_label: 'Base',
      contract_address: stakingContract,
      wallet_address: expectedSigner,
    },
    wallet_action: {
      action_id: `${action}-action`,
      owner_product: 'platform' as const,
      resource: 'regent_staking' as const,
      resource_id: stakingContract,
      action,
      chain_id: 8453,
      to: stakingContract,
      value: '0',
      data: expectedData,
      expected_signer: expectedSigner,
      expires_at: '2026-05-06T18:00:00.000Z',
      idempotency_key: `${action}-action`,
      simulation: {
        required: false,
        status: 'not_required' as const,
        block_number: null,
      },
      risk_copy: 'Review this staking action before signing.',
      ...(action === 'stake'
        ? {
            approval: {
              token: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
              spender: stakingContract,
              amount: '25000000000000000000',
              data: '0x095ea7b3',
            },
          }
        : {}),
    },
  };
}

function expectedReturnInput(
  input?: Partial<{
    amount: string;
    currency: string;
    destinationWalletAddress: string;
    chainId: number;
    expectedSigner: string;
    to: string;
    value: string;
    data: string;
  }>,
) {
  return {
    amount: '10',
    currency: 'USDC',
    destinationWalletAddress: expectedRecipient,
    chainId: 8453,
    expectedSigner,
    to: expectedRecipient,
    value: '0',
    data: expectedData,
    ...input,
  };
}

function expectedWalletActionInput(
  input?: Partial<{
    regentId: string;
    expectedSigner: string;
    to: string;
    value: string;
    data: string;
    riskCopy: string;
    idempotencyKey: string;
    amount: string;
    currency: string;
  }>,
) {
  return {
    regentId: 'atlas-capital',
    expectedSigner,
    to: expectedRecipient,
    value: '0',
    data: expectedData,
    riskCopy: 'You are preparing a wallet action for review before signing.',
    idempotencyKey: 'wallet-action-key',
    amount: '25',
    currency: 'USDC',
    ...input,
  };
}

function confirmedReceipt(
  input?: Partial<{
    txHash: string;
    chainId: number;
    blockNumber: number;
    status: 'confirmed';
    from: string;
    to: string;
    value: string;
    data: string;
  }>,
) {
  return {
    txHash: `0x${'1'.repeat(64)}`,
    chainId: 8453,
    blockNumber: 29300112,
    status: 'confirmed' as const,
    from: expectedSigner,
    to: expectedRecipient,
    value: '0',
    data: expectedData,
    ...input,
  };
}

const platformRwrClient: PlatformRwrClient = {
  async fetchAccount() {
    return {
      kind: 'ok',
      data: {
        authenticated: true,
        companies: [
          {
            id: 101,
            name: 'Atlas Capital',
            slug: 'atlas-capital',
            status: 'active',
          },
        ],
      },
    };
  },
  async fetchWorkItems() {
    return {
      kind: 'ok',
      data: [
        {
          id: 201,
          company_id: 101,
          title: 'Atlas treasury review',
          description: 'Review the treasury move.',
          status: 'active',
          priority: 'normal',
          visibility: 'operator',
          desired_runner_kind: null,
          assigned_worker_id: null,
          assigned_agent_profile_id: null,
          created_at: '2026-04-17T23:41:00.000Z',
          updated_at: '2026-04-17T23:50:00.000Z',
        },
        {
          id: 202,
          company_id: 101,
          title: 'Atlas Capital mobile conversation',
          description: 'Started from mobile.',
          status: 'active',
          priority: 'normal',
          visibility: 'operator',
          desired_runner_kind: null,
          assigned_worker_id: null,
          assigned_agent_profile_id: null,
          created_at: '2026-04-17T23:41:00.000Z',
          updated_at: '2026-04-17T23:41:00.000Z',
        },
      ],
    };
  },
  async createWorkItem() {
    return {
      kind: 'ok',
      data: {
        id: 202,
        company_id: 101,
        title: 'Atlas Capital mobile conversation',
        description: 'Started from mobile.',
        status: 'active',
        priority: 'normal',
        visibility: 'operator',
        desired_runner_kind: null,
        assigned_worker_id: null,
        assigned_agent_profile_id: null,
        created_at: '2026-04-17T23:41:00.000Z',
        updated_at: '2026-04-17T23:41:00.000Z',
      },
    };
  },
  async startRun() {
    return {
      kind: 'ok',
      data: {
        id: 301,
        company_id: 101,
        work_item_id: 202,
        parent_run_id: null,
        root_run_id: null,
        worker_id: null,
        runtime_profile_id: null,
        runner_kind: 'codex',
        status: 'running',
        visibility: 'operator',
        summary: 'Run started from mobile.',
        failure_reason: null,
        cost_usd: '0.00',
        created_at: '2026-04-17T23:42:00.000Z',
        updated_at: '2026-04-17T23:42:00.000Z',
      },
    };
  },
  async fetchRun() {
    return {
      kind: 'ok',
      data: {
        id: 301,
        company_id: 101,
        work_item_id: 202,
        parent_run_id: null,
        root_run_id: null,
        worker_id: null,
        runtime_profile_id: null,
        runner_kind: 'codex',
        status: 'awaiting_approval',
        visibility: 'operator',
        summary: 'Approval is waiting.',
        failure_reason: null,
        cost_usd: '0.00',
        created_at: '2026-04-17T23:42:00.000Z',
        updated_at: '2026-04-17T23:50:00.000Z',
      },
    };
  },
  async fetchRunEvents() {
    return {
      kind: 'ok',
      data: [
        {
          id: 401,
          company_id: 101,
          run_id: 301,
          sequence: 1,
          kind: 'run.message',
          actor_kind: 'agent',
          actor_id: null,
          visibility: 'operator',
          sensitivity: 'normal',
          payload: { message: 'I reviewed the treasury move.' },
          occurred_at: '2026-04-17T23:43:00.000Z',
        },
      ],
    };
  },
  async fetchApprovals() {
    return {
      kind: 'ok',
      data: [
        {
          id: 501,
          company_id: 101,
          run_id: 301,
          approval_type: 'transfer',
          status: 'pending',
          requested_by_actor_kind: 'agent',
          requested_by_actor_id: null,
          risk_summary: 'Approve the treasury transfer.',
          payload: {
            amount: '500',
            currency: 'USDC',
            contract_address: '0x4444444444444444444444444444444444444444',
          },
          resolved_by_human_id: null,
          resolved_at: null,
          expires_at: '2026-04-18T00:00:00.000Z',
          created_at: '2026-04-17T23:50:00.000Z',
          updated_at: '2026-04-17T23:50:00.000Z',
        },
      ],
    };
  },
  async resolveApproval() {
    return {
      kind: 'ok',
      data: {
        id: 501,
        company_id: 101,
        run_id: 301,
        approval_type: 'transfer',
        status: 'approved',
        requested_by_actor_kind: 'agent',
        requested_by_actor_id: null,
        risk_summary: 'Approve the treasury transfer.',
        payload: {
          amount: '500',
          currency: 'USDC',
          contract_address: '0x4444444444444444444444444444444444444444',
        },
        resolved_by_human_id: 1,
        resolved_at: '2026-04-17T23:51:00.000Z',
        expires_at: '2026-04-18T00:00:00.000Z',
        created_at: '2026-04-17T23:50:00.000Z',
        updated_at: '2026-04-17T23:51:00.000Z',
      },
    };
  },
};

const resolvedApprovalClient: PlatformRwrClient = {
  ...platformRwrClient,
  async fetchApprovals() {
    return {
      kind: 'ok',
      data: [
        {
          id: 501,
          company_id: 101,
          run_id: 301,
          approval_type: 'transfer',
          status: 'approved',
          requested_by_actor_kind: 'agent',
          requested_by_actor_id: null,
          risk_summary: 'Approve the treasury transfer.',
          payload: {
            amount: '500',
            currency: 'USDC',
            contract_address: '0x4444444444444444444444444444444444444444',
          },
          resolved_by_human_id: 1,
          resolved_at: '2026-04-17T23:51:00.000Z',
          expires_at: '2026-04-18T00:00:00.000Z',
          created_at: '2026-04-17T23:50:00.000Z',
          updated_at: '2026-04-17T23:51:00.000Z',
        },
      ],
    };
  },
};

const platformStakingClient: PlatformStakingClient = {
  async fetchStaking() {
    return { kind: 'ok', data: { staking: stakingState } };
  },
  async stake(_auth, input) {
    assert.equal(input.walletAddress, expectedSigner);
    assert.equal(input.amount, '25');
    return { kind: 'ok', data: stakingAction('stake') };
  },
  async unstake(_auth, input) {
    assert.equal(input.walletAddress, expectedSigner);
    assert.equal(input.amount, '25');
    return { kind: 'ok', data: stakingAction('unstake') };
  },
  async claimUsdc(_auth, walletAddress) {
    assert.equal(walletAddress, expectedSigner);
    return { kind: 'ok', data: stakingAction('claim_usdc') };
  },
  async claimRegent(_auth, walletAddress) {
    assert.equal(walletAddress, expectedSigner);
    return { kind: 'ok', data: stakingAction('claim_regent') };
  },
  async claimAndRestakeRegent(_auth, walletAddress) {
    assert.equal(walletAddress, expectedSigner);
    return { kind: 'ok', data: stakingAction('claim_and_restake_regent') };
  },
};

test('mobile Agent Brief route stays mounted and returns the current brief shape', () => {
  const routePaths = listRoutePaths();
  assert.ok(routePaths.includes('/mobile/regents/:id/manager'));

  const body = getRegentManagerForUserFromPlatformProjection('atlas-capital', platformProjection);
  assert.ok(body);
  assert.equal(body.regentId, 'atlas-capital');
  assert.equal(body.dashboardUrl, 'https://atlas.regents.sh');
  assert.equal(
    body.roster.some((member: { name: string }) => member.name === 'Agent Brief'),
    true,
  );
});

test('mobile Regent detail includes Platform-owned state', () => {
  const routePaths = listRoutePaths();
  assert.ok(routePaths.includes('/mobile/regents/:id'));

  const body = getRegentForUserFromPlatformProjection('platform-user', 'atlas-capital', platformProjection);
  assert.ok(body);
  assert.equal(body.platformState.claimedName, 'Atlas Capital');
  assert.equal(body.platformState.formationStatus, 'ready');
  assert.equal(Array.isArray(body.platformState.blockers), true);
  assert.equal(Array.isArray(body.returnRequests), true);
});

test('mobile Platform projection forwards bearer auth without cookies', async () => {
  const forwarded: unknown[] = [];

  await requestMobileRoute(
    platformProjection,
    {
      method: 'GET',
      url: '/mobile/regents',
      headers: {
        Authorization: 'Bearer mobile-token',
        Cookie: 'platform_session=secret',
      },
    },
    {
      platformProjectionClient: {
        async fetchProjection(input) {
          forwarded.push(input);
          return { kind: 'ok' as const, projection: platformProjection };
        },
      },
    },
  );

  assert.deepEqual(forwarded, [
    {
      authorization: 'Bearer mobile-token',
    },
  ]);
});

test('mobile Platform terminal routes forward bearer auth without cookies', async () => {
  const forwarded: unknown[] = [];
  const result = await requestMobileRoute(
    platformProjection,
    {
      method: 'GET',
      url: '/mobile/terminal/sessions',
      headers: {
        Authorization: 'Bearer mobile-token',
        Cookie: 'platform_session=secret',
      },
    },
    {
      platformRwrClient: {
        ...platformRwrClient,
        async fetchAccount(auth) {
          forwarded.push(auth);
          return platformRwrClient.fetchAccount(auth);
        },
      },
    },
  );

  assert.equal(result.status, 200);
  assert.deepEqual(forwarded, [
    {
      authorization: 'Bearer mobile-token',
    },
  ]);
});

test('mobile staking routes forward bearer auth and preserve Platform wallet actions', async () => {
  const forwarded: unknown[] = [];
  const stakingClient: PlatformStakingClient = {
    ...platformStakingClient,
    async fetchStaking(auth, walletAddress) {
      forwarded.push({ auth, walletAddress, action: 'fetch' });
      return platformStakingClient.fetchStaking(auth, walletAddress);
    },
    async stake(auth, input) {
      forwarded.push({ auth, input, action: 'stake' });
      return platformStakingClient.stake(auth, input);
    },
  };

  const readResponse = await requestMobileRoute(
    platformProjection,
    {
      method: 'GET',
      url: `/mobile/regent/staking?walletAddress=${expectedSigner}`,
      headers: {
        Authorization: 'Bearer mobile-token',
        Cookie: 'platform_session=secret',
      },
    },
    { platformStakingClient: stakingClient },
  );
  assert.equal(readResponse.status, 200);
  assert.equal(readResponse.body.staking.wallet_address, expectedSigner);

  const stakeResponse = await requestMobileRoute(
    platformProjection,
    {
      method: 'POST',
      url: '/mobile/regent/staking/stake',
      headers: {
        Authorization: 'Bearer mobile-token',
        Cookie: 'platform_session=secret',
      },
      body: {
        walletAddress: expectedSigner,
        amount: '25',
      },
    },
    { platformStakingClient: stakingClient },
  );
  assert.equal(stakeResponse.status, 200);
  assert.equal(stakeResponse.body.wallet_action.owner_product, 'platform');
  assert.equal(stakeResponse.body.wallet_action.action, 'stake');
  assert.equal(stakeResponse.body.wallet_action.approval.spender, stakingContract);
  assert.deepEqual(forwarded, [
    {
      auth: { authorization: 'Bearer mobile-token' },
      walletAddress: expectedSigner,
      action: 'fetch',
    },
    {
      auth: { authorization: 'Bearer mobile-token' },
      input: { walletAddress: expectedSigner, amount: '25' },
      action: 'stake',
    },
  ]);
});

test('mobile staking routes cover unstake and all claim actions', async () => {
  for (const [url, expectedAction] of [
    ['/mobile/regent/staking/unstake', 'unstake'],
    ['/mobile/regent/staking/claim-usdc', 'claim_usdc'],
    ['/mobile/regent/staking/claim-regent', 'claim_regent'],
    ['/mobile/regent/staking/claim-and-restake-regent', 'claim_and_restake_regent'],
  ] as const) {
    const response = await requestMobileRoute(
      platformProjection,
      {
        method: 'POST',
        url,
        body:
          expectedAction === 'unstake'
            ? { walletAddress: expectedSigner, amount: '25' }
            : { walletAddress: expectedSigner },
      },
      { platformStakingClient },
    );

    assert.equal(response.status, 200);
    assert.equal(response.body.wallet_action.action, expectedAction);
    assert.equal(response.body.wallet_action.owner_product, 'platform');
  }
});

test('Platform staking responses reject malformed transaction data before mobile signing', async () => {
  const previousPlatformUrl = process.env.PLATFORM_API_BASE_URL;
  process.env.PLATFORM_API_BASE_URL = 'https://platform.example';

  try {
    const malformedAction = {
      ok: true,
      ...stakingAction('stake'),
      wallet_action: {
        ...stakingAction('stake').wallet_action,
        data: '0xabc',
      },
    };
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify(malformedAction), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    const client = createPlatformStakingClient(fetchImpl);

    const result = await client.stake({}, { walletAddress: expectedSigner, amount: '25' });

    assert.equal(result.kind, 'upstream_error');
    if (result.kind === 'upstream_error') {
      assert.equal(result.message, 'Platform response did not match the current contract.');
    }
  } finally {
    if (previousPlatformUrl === undefined) {
      delete process.env.PLATFORM_API_BASE_URL;
    } else {
      process.env.PLATFORM_API_BASE_URL = previousPlatformUrl;
    }
  }
});

test('mobile Regent state can be sourced from the Platform projection contract', () => {
  const regents = listRegentsForUserFromPlatformProjection('platform-user', platformProjection);
  const detail = getRegentForUserFromPlatformProjection('platform-user', 'atlas-capital', platformProjection);

  assert.equal(regents.length, 1);
  assert.ok(detail);
  assert.equal(detail.platformState.claimedName, 'Atlas Capital');
  assert.equal(detail.platformState.billingStatus, 'prepaid');
  assert.equal(detail.platformState.runtimeStatus, 'ready');
  assert.equal(detail.platformState.prepaidBalanceUsd, '50.25');
});

test('mobile Regent Base snapshot is served from the Platform projection', async () => {
  const response = await requestMobileRoute(platformProjection, {
    method: 'GET',
    url: '/mobile/regents/atlas-capital/base-snapshot',
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.chainId, 8453);
  assert.equal(response.body.blockNumber, null);
  assert.equal(response.body.contractAddress, null);
  assert.equal(response.body.stale, false);
  assert.equal(response.body.snapshot.regentId, 'atlas-capital');
  assert.equal(response.body.snapshot.platformState.billingStatus, 'prepaid');
});

test('mobile money routes accept the listed Regent ID when Platform slugs differ', async () => {
  const projection = publicSlugProjection();
  const returnResponse = await requestMobileRoute(projection, {
    method: 'POST',
    url: '/mobile/regents/atlas-public/return-requests',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': 'public-return',
    },
    body: expectedReturnInput(),
  });
  assert.equal(returnResponse.status, 201);
  assert.equal(returnResponse.body.returnRequest.regentId, 'atlas-public');

  const fundingResponse = await requestMobileRoute(projection, {
    method: 'POST',
    url: '/mobile/regents/atlas-public/funding-intents',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': 'public-funding',
    },
    body: {
      amount: '25',
      currency: 'USDC',
      sourceWalletAddress: expectedSigner,
      destinationWalletAddress: expectedRecipient,
      chainId: 8453,
      tokenAddress: expectedFundingToken,
      expectedSigner,
      to: expectedFundingToken,
      value: '0',
      data: fundingTransferData(),
    },
  });
  assert.equal(fundingResponse.status, 201);
  assert.equal(fundingResponse.body.fundingIntent.regentId, 'atlas-public');

  const walletActionResponse = await requestMobileRoute(projection, {
    method: 'POST',
    url: '/mobile/wallet-actions/funding/prepare',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': 'public-wallet-action',
    },
    body: {
      regentId: 'atlas-public',
      expectedSigner,
      to: expectedRecipient,
      value: '0',
      data: expectedData,
      riskCopy: 'You are preparing a funding action for review before signing.',
      amount: '25',
      currency: 'USDC',
    },
  });
  assert.equal(walletActionResponse.status, 201);
  assert.equal(walletActionResponse.body.wallet_action.resource_id, 'atlas-public');
});

test('funding intents reject transfer details for a different recipient or amount', async () => {
  const projection = publicSlugProjection();
  const baseBody = {
    amount: '25',
    currency: 'USDC',
    sourceWalletAddress: expectedSigner,
    destinationWalletAddress: expectedRecipient,
    chainId: 8453,
    tokenAddress: expectedFundingToken,
    expectedSigner,
    to: expectedFundingToken,
    value: '0',
    data: fundingTransferData(),
  };

  const wrongRecipient = await requestMobileRoute(projection, {
    method: 'POST',
    url: '/mobile/regents/atlas-public/funding-intents',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': 'wrong-recipient',
    },
    body: {
      ...baseBody,
      data: fundingTransferData({ recipient: '0x4444444444444444444444444444444444444444' }),
    },
  });
  assert.equal(wrongRecipient.status, 400);

  const wrongAmount = await requestMobileRoute(projection, {
    method: 'POST',
    url: '/mobile/regents/atlas-public/funding-intents',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': 'wrong-amount',
    },
    body: {
      ...baseBody,
      data: fundingTransferData({ amount: '26' }),
    },
  });
  assert.equal(wrongAmount.status, 400);
});

test('return requests require the displayed destination to match the transaction target', async () => {
  const response = await requestMobileRoute(platformProjection, {
    method: 'POST',
    url: '/mobile/regents/atlas-capital/return-requests',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': 'destination-target-mismatch',
    },
    body: expectedReturnInput({
      destinationWalletAddress: '0x3333333333333333333333333333333333333333',
      to: expectedRecipient,
    }),
  });

  assert.equal(response.status, 400);
});

test('mobile terminal and money routes remain mounted through the extracted router', async () => {
  const routePaths = listRoutePaths();
  assert.ok(routePaths.includes('/mobile/terminal/sessions'));
  assert.ok(routePaths.includes('/mobile/regents/:id/base-snapshot'));
  assert.ok(routePaths.includes('/mobile/regents/:id/funding-intents'));
  assert.ok(routePaths.includes('/mobile/regents/:id/funding-intents/:funding_intent_id'));
  assert.ok(routePaths.includes('/mobile/regents/:id/funding-intents/:funding_intent_id/confirm'));
  assert.ok(routePaths.includes('/mobile/regent/staking'));
  assert.ok(routePaths.includes('/mobile/regent/staking/stake'));
  assert.ok(routePaths.includes('/mobile/regent/staking/unstake'));
  assert.ok(routePaths.includes('/mobile/regent/staking/claim-usdc'));
  assert.ok(routePaths.includes('/mobile/regent/staking/claim-regent'));
  assert.ok(routePaths.includes('/mobile/regent/staking/claim-and-restake-regent'));
  assert.ok(routePaths.includes('/mobile/wallet-actions/:type/prepare'));
  assert.ok(routePaths.includes('/mobile/wallet-actions/:action_id/confirm'));

  const sessions = await listTerminalSessions(platformRwrClient, {});
  assert.equal(sessions.kind, 'ok');
  if (sessions.kind === 'ok') {
    assert.ok(sessions.data.length > 0);
  }
});

test('mobile Regent wallet intent state is written to durable backend storage', () => {
  const created = createRegentReturnRequestForUser(
    'durable-user',
    'atlas-capital',
    expectedReturnInput({ amount: '12' }),
    'durable-return',
  );

  assert.ok(created);
  const filePath = getMobileRegentStateFilePathForTests();
  assert.equal(existsSync(filePath), true);
  assert.match(readFileSync(filePath, 'utf8'), /atlas-capital/);
});

test('mobile terminal sessions and messages are sourced from Platform RWR', async () => {
  const created = await createTerminalSession(platformRwrClient, {}, { agentId: '101', agentName: 'Atlas Capital' });
  assert.equal(created.kind, 'ok');
  if (created.kind !== 'ok') {
    return;
  }

  const updated = await postTerminalMessage(platformRwrClient, {}, created.data.id, 'Review this from mobile.');
  assert.equal(updated.kind, 'ok');
});

test('mobile terminal approvals resolve through Platform RWR', async () => {
  const result = await resolveTerminalApproval(platformRwrClient, {}, '101~202~301', '501', 'approved');
  assert.equal(result.kind, 'ok');
});

test('mobile terminal events expose explicit approval review fields and event polling markers', async () => {
  const first = await getTerminalEvents(platformRwrClient, {}, '101~202~301');
  assert.equal(first.kind, 'ok');
  if (first.kind !== 'ok') {
    return;
  }

  const approvalEvent = first.data.find((event) => event.type === 'tool.request');
  assert.ok(approvalEvent);
  assert.equal(approvalEvent.action, 'transfer');
  assert.equal(approvalEvent.regentName, 'Atlas Capital');
  assert.equal(approvalEvent.riskCopy, 'Approve the treasury transfer.');
  assert.equal(approvalEvent.amount, '500');
  assert.equal(approvalEvent.currency, 'USDC');
  assert.equal(approvalEvent.contractAddress, '0x4444444444444444444444444444444444444444');

  const latestEvent = first.data.at(-1);
  assert.ok(latestEvent?.eventId);
  const next = await getTerminalEvents(platformRwrClient, {}, '101~202~301', latestEvent.eventId);
  assert.equal(next.kind, 'ok');
  if (next.kind === 'ok') {
    assert.deepEqual(next.data, []);
  }
});

test('mobile terminal event polling returns only the approval decision after approval resolves', async () => {
  const first = await getTerminalEvents(platformRwrClient, {}, '101~202~301');
  assert.equal(first.kind, 'ok');
  if (first.kind !== 'ok') {
    return;
  }

  const requestEvent = first.data.find((event) => event.type === 'tool.request');
  assert.equal(requestEvent?.eventId, 'approval:501:requested');

  const next = await getTerminalEvents(resolvedApprovalClient, {}, '101~202~301', requestEvent.eventId);
  assert.equal(next.kind, 'ok');
  if (next.kind === 'ok') {
    assert.deepEqual(
      next.data.map((event) => event.type),
      ['tool.resolved'],
    );
    assert.equal(next.data[0]?.eventId, 'approval:501:resolved');
    assert.equal(next.data[0]?.result, 'approved');
  }
});

test('return requests require a confirmed Base receipt before completion', () => {
  const created = createRegentReturnRequestForUser(
    'receipt-user',
    'atlas-capital',
    expectedReturnInput(),
    'return-receipt-test',
  );
  assert.ok(created);

  const rejected = confirmRegentReturnRequestForUser('receipt-user', 'atlas-capital', created.id, {
    txHash: '0xabc',
    chainId: 8453,
    blockNumber: 1,
    status: 'confirmed',
    from: expectedSigner,
    to: expectedRecipient,
    value: '0',
    data: expectedData,
  });
  assert.equal(rejected.kind, 'conflict');

  const confirmed = confirmRegentReturnRequestForUser('receipt-user', 'atlas-capital', created.id, confirmedReceipt());
  assert.equal(confirmed.kind, 'ok');
  if (confirmed.kind === 'ok') {
    assert.equal(confirmed.returnRequest.status, 'confirmed');
  }
});

test('return request confirmation rejects receipts for the wrong transaction details', () => {
  const created = createRegentReturnRequestForUser(
    'return-mismatch-user',
    'atlas-capital',
    expectedReturnInput(),
    'return-mismatch-test',
  );
  assert.ok(created);

  assert.equal(
    confirmRegentReturnRequestForUser(
      'return-mismatch-user',
      'atlas-capital',
      created.id,
      confirmedReceipt({ from: '0x3333333333333333333333333333333333333333' }),
    ).kind,
    'conflict',
  );
  assert.equal(
    confirmRegentReturnRequestForUser(
      'return-mismatch-user',
      'atlas-capital',
      created.id,
      confirmedReceipt({ to: '0x3333333333333333333333333333333333333333' }),
    ).kind,
    'conflict',
  );
  assert.equal(
    confirmRegentReturnRequestForUser(
      'return-mismatch-user',
      'atlas-capital',
      created.id,
      confirmedReceipt({ value: '1' }),
    ).kind,
    'conflict',
  );
  assert.equal(
    confirmRegentReturnRequestForUser(
      'return-mismatch-user',
      'atlas-capital',
      created.id,
      confirmedReceipt({ data: '0x1234' }),
    ).kind,
    'conflict',
  );
});

test('funding intents are idempotent and keep expected Base funding details', () => {
  const input = {
    amount: '25',
    currency: 'USDC',
    sourceWalletAddress: '0x1111111111111111111111111111111111111111',
    destinationWalletAddress: '0x2222222222222222222222222222222222222222',
    chainId: 8453,
    tokenAddress: '0x3333333333333333333333333333333333333333',
    expectedSigner,
    to: '0x3333333333333333333333333333333333333333',
    value: '0',
    data: fundingTransferData(),
  };
  const first = createRegentFundingIntentForUser('funding-user', 'atlas-capital', input, 'fund-once');
  const second = createRegentFundingIntentForUser('funding-user', 'atlas-capital', input, 'fund-once');

  assert.ok(first);
  assert.deepEqual(second, first);
  assert.equal(first.chainId, 8453);
  assert.equal(first.currency, 'USDC');
  assert.equal(first.expectedSigner, expectedSigner);
  assert.equal(first.to, '0x3333333333333333333333333333333333333333');
  assert.equal(first.value, '0');
  assert.equal(first.data, fundingTransferData());
});

test('funding intents can be fetched and confirmed from matching Base receipts', () => {
  const created = createRegentFundingIntentForUser(
    'funding-confirm-user',
    'atlas-capital',
    {
      amount: '25',
      currency: 'USDC',
      sourceWalletAddress: expectedSigner,
      destinationWalletAddress: expectedRecipient,
      chainId: 8453,
      tokenAddress: expectedFundingToken,
      expectedSigner,
      to: expectedFundingToken,
      value: '0',
      data: fundingTransferData(),
    },
    'fund-confirm',
  );
  assert.ok(created);

  const fetched = getRegentFundingIntentForUser('funding-confirm-user', 'atlas-capital', created.id);
  assert.deepEqual(fetched, created);

  const rejected = confirmRegentFundingIntentForUser(
    'funding-confirm-user',
    'atlas-capital',
    created.id,
    confirmedReceipt({ to: '0x4444444444444444444444444444444444444444', data: fundingTransferData() }),
  );
  assert.equal(rejected.kind, 'conflict');

  const confirmed = confirmRegentFundingIntentForUser(
    'funding-confirm-user',
    'atlas-capital',
    created.id,
    confirmedReceipt({ to: expectedFundingToken, data: fundingTransferData() }),
  );
  assert.equal(confirmed.kind, 'ok');
  if (confirmed.kind === 'ok') {
    assert.equal(confirmed.fundingIntent.status, 'confirmed');
    assert.equal(confirmed.fundingIntent.txHash, `0x${'1'.repeat(64)}`);
  }
});

test('prepared wallet actions expire and confirm from Base receipts only', () => {
  const action = prepareWalletActionForUser('wallet-action-user', 'funding', expectedWalletActionInput());

  assert.ok(action);
  assert.equal(action.action, 'funding');
  assert.equal(action.owner_product, 'ios');
  assert.equal(action.resource_id, 'atlas-capital');
  assert.equal(action.chain_id, 8453);
  assert.equal(action.expected_signer, expectedSigner);
  assert.match(action.expires_at, /T/);
  const ttlMs = Date.parse(action.expires_at) - Date.now();
  assert.ok(ttlMs > 9 * 60 * 1000);
  assert.ok(ttlMs <= 10 * 60 * 1000);
});

test('prepared wallet actions support funding and returns with the same required fields', () => {
  for (const type of ['funding', 'return'] as const) {
    const action = prepareWalletActionForUser(
      `wallet-action-${type}-user`,
      type,
      expectedWalletActionInput({
        idempotencyKey: `${type}-wallet-action-key`,
      }),
    );

    assert.ok(action);
    assert.equal(action.action, type);
    assert.equal(action.owner_product, 'ios');
    assert.equal(action.resource_id, 'atlas-capital');
    assert.equal(action.chain_id, 8453);
    assert.equal(action.expected_signer, expectedSigner);
    assert.equal(action.to, expectedRecipient);
    assert.equal(action.value, '0');
    assert.equal(action.data, expectedData);
    assert.deepEqual(action.simulation, {
      required: false,
      status: 'not_required',
      block_number: null,
    });
    assert.equal(action.risk_copy, 'You are preparing a wallet action for review before signing.');
    assert.equal(action.idempotency_key, `${type}-wallet-action-key`);
  }
});

test('prepared wallet actions reuse the same idempotency key for duplicate prepares', () => {
  const input = expectedWalletActionInput({
    idempotencyKey: 'duplicate-wallet-action-key',
  });
  const first = prepareWalletActionForUser('duplicate-wallet-action-user', 'funding', input);
  const second = prepareWalletActionForUser('duplicate-wallet-action-user', 'funding', input);

  assert.ok(first);
  assert.ok(second);
  assert.equal(second.action_id, first.action_id);
  assert.equal(second.expires_at, first.expires_at);
  assert.equal(second.risk_copy, first.risk_copy);

  const confirmed = confirmPreparedWalletActionForUser(first.action_id, confirmedReceipt());
  assert.equal(confirmed.kind, 'ok');

  const afterConfirm = prepareWalletActionForUser('duplicate-wallet-action-user', 'funding', input);
  assert.ok(afterConfirm);
  assert.equal(afterConfirm.action_id, first.action_id);
  assert.equal(afterConfirm.status, 'confirmed');
});

test('prepared wallet actions reject receipts for the wrong transaction details', () => {
  const action = prepareWalletActionForUser(
    'wallet-action-user',
    'funding',
    expectedWalletActionInput({ idempotencyKey: 'wallet-action-conflict-key' }),
  );
  assert.ok(action);

  assert.equal(
    confirmPreparedWalletActionForUser(
      action.action_id,
      confirmedReceipt({ from: '0x3333333333333333333333333333333333333333' }),
    ).kind,
    'conflict',
  );
  assert.equal(
    confirmPreparedWalletActionForUser(
      action.action_id,
      confirmedReceipt({ to: '0x3333333333333333333333333333333333333333' }),
    ).kind,
    'conflict',
  );
  assert.equal(confirmPreparedWalletActionForUser(action.action_id, confirmedReceipt({ value: '1' })).kind, 'conflict');
  assert.equal(
    confirmPreparedWalletActionForUser(action.action_id, confirmedReceipt({ data: '0x1234' })).kind,
    'conflict',
  );
  assert.equal(confirmPreparedWalletActionForUser(action.action_id, confirmedReceipt()).kind, 'ok');
});

test('prepared wallet actions cannot be confirmed after their expiry time', () => {
  const action = prepareWalletActionForUser(
    'expired-wallet-action-user',
    'funding',
    expectedWalletActionInput({ idempotencyKey: 'expired-wallet-action-key' }),
  );
  assert.ok(action);

  const result = confirmPreparedWalletActionForUser(
    action.action_id,
    confirmedReceipt(),
    new Date(Date.parse(action.expires_at)),
  );

  assert.equal(result.kind, 'expired');
  if (result.kind === 'expired') {
    assert.equal(result.action.status, 'expired');
  }
});

test('expired prepared wallet actions report expiry before receipt mismatches', () => {
  const action = prepareWalletActionForUser(
    'expired-wallet-action-mismatch-user',
    'funding',
    expectedWalletActionInput({
      idempotencyKey: 'expired-wallet-action-mismatch-key',
    }),
  );
  assert.ok(action);

  const result = confirmPreparedWalletActionForUser(
    action.action_id,
    confirmedReceipt({ from: '0x3333333333333333333333333333333333333333' }),
    new Date(Date.parse(action.expires_at)),
  );

  assert.equal(result.kind, 'expired');
});

test('mobile Regent Manager data is returned as a fresh copy', () => {
  const first = getRegentManagerForUserFromPlatformProjection('atlas-capital', platformProjection);
  assert.ok(first);
  const firstGoal = first.goals[0];
  assert.ok(firstGoal);

  firstGoal.title = 'Changed by test';

  const second = getRegentManagerForUserFromPlatformProjection('atlas-capital', platformProjection);
  assert.ok(second);
  const secondGoal = second.goals[0];
  assert.ok(secondGoal);
  assert.notEqual(secondGoal.title, 'Changed by test');
});
