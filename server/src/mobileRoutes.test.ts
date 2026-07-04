import assert from 'node:assert/strict';
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
  readMobileRegentStateForTests,
  getRegentManagerForUserFromPlatformProjection,
  getRegentForUserFromPlatformProjection,
  listRegentsForUserFromPlatformProjection,
  getRegentReturnRequestForUser,
  prepareWalletActionForUser,
  pruneMobileRegentState,
  resetMobileRegentStateForTests,
} from './mobileRegents.js';
import { createMobileRoutes } from './mobileRoutes.js';
import {
  createMobileVoiceSessionRecord,
  disconnectMobileVoiceSession,
  getActiveMobileVoiceSession,
  readMobileVoiceSessionStateForTests,
  pruneMobileVoiceSessions,
  resetMobileVoiceSessionsForTests,
} from './mobileVoiceSessions.js';
import {
  createMessageThread,
  getMessageThreadEvents,
  getMessageThread,
  listMessageThreads,
  postMessageThreadMessage,
  resolveMessageThreadApproval,
} from './mobileMessageThreads.js';
import {
  createPlatformAgentLinkClient,
  createPlatformStakingClient,
  type PlatformAgentLinkClient,
  type PlatformProjection,
  type PlatformRwrClient,
  type RwrWorkItem,
  type PlatformStakingClient,
} from './platformProjection.js';
import type { HermesVoiceClient } from './services/hermesVoiceClient.js';

beforeEach(async () => {
  await resetMobileRegentStateForTests();
  await resetMobileVoiceSessionsForTests();
});

/**
 * In-memory stand-in for the release Redis client, mirroring the fake used by
 * the webhook dedupe tests. `eval` implements the same compare-and-swap
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

function listRoutePaths() {
  const router = createMobileRoutes();
  const paths: string[] = [];

  function collect(stack: Array<{ route?: { path?: unknown }; handle?: { stack?: unknown } }>) {
    for (const layer of stack) {
      if (typeof layer.route?.path === 'string') {
        paths.push(layer.route.path);
      }
      if (Array.isArray(layer.handle?.stack)) {
        collect(layer.handle.stack as Array<{ route?: { path?: unknown }; handle?: { stack?: unknown } }>);
      }
    }
  }

  collect(router.stack as Array<{ route?: { path?: unknown }; handle?: { stack?: unknown } }>);
  return paths;
}

function voiceProjection(input?: { satisfied?: boolean; enabled?: boolean; health?: 'ok' | 'degraded' | 'unavailable' }) {
  const satisfied = input?.satisfied ?? true;

  return {
    enabled: input?.enabled ?? satisfied,
    health: input?.health ?? 'ok',
    status_url: 'https://atlas.regents.sh/hermes/voice/status',
    session_url: 'https://atlas.regents.sh/hermes/voice/session',
    provider: 'openai-realtime' as const,
    model: 'gpt-realtime-2',
    tool_registry_digest: 'voice-tools-v1',
    account: {
      required: true as const,
      satisfied,
      provider: 'openai_chatgpt' as const,
      connect_url: satisfied ? null : 'https://platform.regents.sh/app/agents/atlas-capital?connect=chatgpt',
    },
  };
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
        wallet_address: '0x7AA4fb65E3a74F4797e95AA8EF1fD54e9b3d0812',
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
        voice: voiceProjection(),
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

function platformProjectionWithVoice(voice: ReturnType<typeof voiceProjection>) {
  return {
    ...platformProjection,
    companies: platformProjection.companies.map((company) => ({
      ...company,
      runtime: {
        ...company.runtime,
        voice,
      },
    })),
  } satisfies PlatformProjection;
}

function hermesVoiceClientForTests(input?: {
  calls?: Array<{ method: string; input: unknown }>;
  sessionId?: string;
}): HermesVoiceClient {
  const calls = input?.calls;

  return {
    async status(statusInput) {
      calls?.push({ method: 'status', input: statusInput });
      return {
        kind: 'ok',
        data: {
          enabled: true,
          health: 'ok',
          agent_id: 'atlas-capital',
          account: {
            required: true,
            satisfied: true,
            provider: 'openai_chatgpt',
            connect_url: null,
          },
          active_session_id: null,
          active_turn_id: null,
          queue_depth: 0,
          last_event_id: null,
        },
      };
    },
    async createSession(sessionInput) {
      calls?.push({ method: 'createSession', input: sessionInput });
      const expiresAt = '2026-05-16T19:00:00.000Z';
      return {
        kind: 'ok',
        data: {
          session_id: input?.sessionId || 'hermes-session-1',
          agent_id: 'atlas-capital',
          expires_at: expiresAt,
          realtime: {
            provider: 'openai-realtime',
            model: 'gpt-realtime-2',
            client_secret: 'ephemeral-voice-secret',
            client_secret_expires_at: expiresAt,
            calls_url: 'https://api.openai.com/v1/realtime/calls',
            realtime_session_id: 'realtime-session-1',
          },
          tools: [
            {
              name: 'hermes_turn',
              owner: 'hermes',
              description: 'Start hosted work.',
              requires_approval: false,
            },
          ],
        },
      };
    },
    async prewarm(prewarmInput) {
      calls?.push({ method: 'prewarm', input: prewarmInput });
      return { kind: 'ok', data: { ok: true } };
    },
    async disconnect(disconnectInput) {
      calls?.push({ method: 'disconnect', input: disconnectInput });
      return { kind: 'ok', data: { ok: true } };
    },
    async submitToolResult(toolResultInput) {
      calls?.push({ method: 'submitToolResult', input: toolResultInput });
      return { kind: 'ok', data: { ok: true } };
    },
  };
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
const expectedRegentWallet = '0x7AA4fb65E3a74F4797e95AA8EF1fD54e9b3d0812';
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

function fundingTransferData(input?: { recipient?: `0x${string}`; amount?: string; decimals?: number }) {
  return encodeFunctionData({
    abi: erc20TransferAbi,
    functionName: 'transfer',
    args: [input?.recipient ?? expectedRecipient, parseUnits(input?.amount ?? '25', input?.decimals ?? 6)],
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
            amount_usd: '500.00',
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

test('mobile Agent Brief is scoped to the signed-in projection: owner succeeds, others are denied', async () => {
  // The projection is fetched with the caller's own bearer token, so it only
  // ever contains the signed-in user's Regents. A different user's projection
  // does not contain another user's Regent, so requesting it must be denied.
  const ownerResponse = await requestMobileRoute(platformProjection, {
    method: 'GET',
    url: '/mobile/regents/atlas-capital/manager',
    headers: {
      Authorization: 'Bearer owner-token',
    },
  });

  assert.equal(ownerResponse.status, 200);
  assert.equal(ownerResponse.body.regentId, 'atlas-capital');

  const otherUserProjection: PlatformProjection = {
    ...platformProjection,
    companies: platformProjection.companies.map((company) => ({
      ...company,
      company: {
        ...company.company,
        id: 999,
        name: 'Borealis Labs',
        slug: 'borealis-labs',
        claimed_label: 'Borealis Labs',
      },
      public_profile: {
        ...company.public_profile,
        slug: 'borealis-labs',
      },
    })),
    public_profiles: platformProjection.public_profiles.map((profile) => ({
      ...profile,
      slug: 'borealis-labs',
    })),
  };

  const otherUserResponse = await requestMobileRoute(otherUserProjection, {
    method: 'GET',
    url: '/mobile/regents/atlas-capital/manager',
    headers: {
      Authorization: 'Bearer other-user-token',
    },
  });

  assert.equal(otherUserResponse.status, 404);
  assert.equal(otherUserResponse.body.error.code, 'NotFound');
});

test('mobile Regent detail includes Platform-owned state', async () => {
  const routePaths = listRoutePaths();
  assert.ok(routePaths.includes('/mobile/regents/:id'));

  const body = await getRegentForUserFromPlatformProjection('platform-user', 'atlas-capital', platformProjection);
  assert.ok(body);
  assert.equal(body.platformState.claimedName, 'Atlas Capital');
  assert.equal(body.platformState.formationStatus, 'ready');
  assert.equal(Array.isArray(body.platformState.blockers), true);
  assert.equal(Array.isArray(body.returnRequests), true);
  assert.deepEqual(body.voice, {
    enabled: true,
    health: 'ok',
    account: {
      required: true,
      satisfied: true,
      provider: 'openai_chatgpt',
      connect_url: null,
    },
  });
});

test('mobile Hermes voice routes mount through the live mobile router', () => {
  const routePaths = listRoutePaths();

  assert.ok(routePaths.includes('/mobile/agents/:agent_id/voice/status'));
  assert.ok(routePaths.includes('/mobile/agents/:agent_id/voice/session'));
  assert.ok(routePaths.includes('/mobile/agents/:agent_id/voice/prewarm'));
  assert.ok(routePaths.includes('/mobile/agents/:agent_id/voice/disconnect'));
  assert.ok(routePaths.includes('/mobile/agents/:agent_id/voice/tool-results'));
});

test('mobile Hermes voice status shows ChatGPT connection state without starting voice', async () => {
  const calls: Array<{ method: string; input: unknown }> = [];
  const response = await requestMobileRoute(
    platformProjectionWithVoice(voiceProjection({ satisfied: false, enabled: false })),
    {
      method: 'GET',
      url: '/mobile/agents/atlas-capital/voice/status',
      headers: {
        Authorization: 'Bearer mobile-token',
      },
    },
    {
      hermesVoiceClient: hermesVoiceClientForTests({ calls }),
    },
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.enabled, false);
  assert.equal(response.body.account.required, true);
  assert.equal(response.body.account.satisfied, false);
  assert.equal(response.body.account.provider, 'openai_chatgpt');
  assert.match(response.body.account.connect_url, /connect=chatgpt/);
  assert.deepEqual(calls, []);
});

test('mobile Hermes voice session requires connected ChatGPT account', async () => {
  const calls: Array<{ method: string; input: unknown }> = [];
  const response = await requestMobileRoute(
    platformProjectionWithVoice(voiceProjection({ satisfied: false, enabled: false })),
    {
      method: 'POST',
      url: '/mobile/agents/atlas-capital/voice/session',
      headers: {
        Authorization: 'Bearer mobile-token',
      },
      body: {
        device_capabilities: ['ios_status'],
        preferred_transport: 'webrtc',
      },
    },
    {
      hermesVoiceClient: hermesVoiceClientForTests({ calls }),
    },
  );

  assert.equal(response.status, 403);
  assert.equal(response.body.error.code, 'ChatGptAccountRequired');
  assert.deepEqual(calls, []);
});

test('mobile Hermes voice session requires signed-in mobile auth', async () => {
  const response = await requestMobileRoute(
    platformProjection,
    {
      method: 'POST',
      url: '/mobile/agents/atlas-capital/voice/session',
      body: {
        device_capabilities: ['ios_status'],
        preferred_transport: 'webrtc',
      },
    },
    {
      platformProjectionClient: {
        async fetchProjection(input) {
          assert.equal(input.authorization, undefined);
          return { kind: 'unauthorized' as const };
        },
      },
    },
  );

  assert.equal(response.status, 401);
  assert.equal(response.body.error.code, 'Unauthorized');
});

test('mobile Hermes voice session rejects agents outside the signed-in projection', async () => {
  const response = await requestMobileRoute(
    platformProjection,
    {
      method: 'POST',
      url: '/mobile/agents/other-agent/voice/session',
      headers: {
        Authorization: 'Bearer mobile-token',
      },
      body: {
        device_capabilities: ['ios_status'],
        preferred_transport: 'webrtc',
      },
    },
  );

  assert.equal(response.status, 403);
  assert.equal(response.body.error.code, 'Forbidden');
});

test('mobile Hermes voice session returns only short-lived voice credentials after account gate', async () => {
  const calls: Array<{ method: string; input: unknown }> = [];
  const response = await requestMobileRoute(
    platformProjection,
    {
      method: 'POST',
      url: '/mobile/agents/atlas-capital/voice/session',
      headers: {
        Authorization: 'Bearer mobile-token',
      },
      body: {
        voice: 'marin',
        locale: 'en-US',
        timezone: 'America/New_York',
        reasoning_effort: 'low',
        device_capabilities: ['ios_status', 'ios_approval_request'],
        preferred_transport: 'webrtc',
      },
    },
    {
      hermesVoiceClient: hermesVoiceClientForTests({ calls }),
    },
  );

  assert.equal(response.status, 201);
  assert.notEqual(response.body.session_id, 'hermes-session-1');
  assert.equal(response.body.agent_id, 'atlas-capital');
  assert.equal(response.body.account.satisfied, true);
  assert.equal(response.body.realtime.provider, 'openai-realtime');
  assert.equal(response.body.realtime.client_secret, 'ephemeral-voice-secret');
  assert.doesNotMatch(JSON.stringify(response.body), /OPENAI_API_KEY|sk-[A-Za-z0-9]/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.method, 'createSession');
  assert.match(JSON.stringify(calls[0]?.input), /OpenAI-Safety-Identifier|safetyIdentifier/);
});

test('mobile Hermes voice disconnect closes the hosted session recorded for the phone session', async () => {
  const calls: Array<{ method: string; input: unknown }> = [];
  const hermesVoiceClient = hermesVoiceClientForTests({ calls, sessionId: 'hermes-session-close-me' });
  const session = await requestMobileRoute(
    platformProjection,
    {
      method: 'POST',
      url: '/mobile/agents/atlas-capital/voice/session',
      headers: {
        Authorization: 'Bearer mobile-token',
      },
      body: {
        device_capabilities: ['ios_status'],
        preferred_transport: 'webrtc',
      },
    },
    { hermesVoiceClient },
  );

  assert.equal(session.status, 201);

  const disconnect = await requestMobileRoute(
    platformProjection,
    {
      method: 'POST',
      url: '/mobile/agents/atlas-capital/voice/disconnect',
      headers: {
        Authorization: 'Bearer mobile-token',
      },
      body: {
        session_id: session.body.session_id,
      },
    },
    { hermesVoiceClient },
  );

  assert.equal(disconnect.status, 200);
  const disconnectCall = calls.find((call) => call.method === 'disconnect');
  assert.match(JSON.stringify(disconnectCall?.input), /hermes-session-close-me/);
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

test('mobile Platform message routes forward bearer auth without cookies', async () => {
  const forwarded: unknown[] = [];
  const result = await requestMobileRoute(
    platformProjection,
    {
      method: 'GET',
      url: '/mobile/message/threads',
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

test('mobile agent-link claim forwards the code and bearer auth, relaying the connected agent as 201', async () => {
  const forwarded: unknown[] = [];
  const platformAgentLinkClient: PlatformAgentLinkClient = {
    async claim(auth, code) {
      forwarded.push({ auth, code });
      return { kind: 'ok', data: { connectedAgent: { id: '42', name: 'Atlas' } } };
    },
  };

  const response = await requestMobileRoute(
    platformProjection,
    {
      method: 'POST',
      url: '/mobile/agent-links/claim',
      headers: {
        Authorization: 'Bearer mobile-token',
        Cookie: 'platform_session=secret',
      },
      body: { code: 'PAIR-CODE' },
    },
    { platformAgentLinkClient },
  );

  assert.equal(response.status, 201);
  assert.deepEqual(response.body, { connectedAgent: { id: '42', name: 'Atlas' } });
  assert.deepEqual(forwarded, [{ auth: { authorization: 'Bearer mobile-token' }, code: 'PAIR-CODE' }]);
});

test('mobile agent-link claim rejects a missing code before calling Platform', async () => {
  let called = false;
  const platformAgentLinkClient: PlatformAgentLinkClient = {
    async claim() {
      called = true;
      return { kind: 'ok', data: { connectedAgent: { id: '1', name: 'x' } } };
    },
  };

  const response = await requestMobileRoute(
    platformProjection,
    { method: 'POST', url: '/mobile/agent-links/claim', body: {} },
    { platformAgentLinkClient },
  );

  assert.equal(response.status, 400);
  assert.equal(called, false);
  assert.equal(response.body.error.message, 'A pairing code is required to connect your agent.');
});

test('mobile agent-link claim maps Platform outcomes to mobile status codes', async () => {
  const cases = [
    { kind: 'not_found' as const, status: 404 },
    { kind: 'unauthorized' as const, status: 401 },
    { kind: 'missing_config' as const, requiredEnv: 'PLATFORM_API_BASE_URL' as const, status: 503 },
    { kind: 'conflict' as const, message: 'This agent is already connected to a different account.', status: 409 },
    { kind: 'upstream_error' as const, message: 'Platform records are unavailable.', status: 502 },
  ];

  for (const outcome of cases) {
    const { status, ...clientResult } = outcome;
    const platformAgentLinkClient: PlatformAgentLinkClient = {
      async claim() {
        return clientResult as Awaited<ReturnType<PlatformAgentLinkClient['claim']>>;
      },
    };

    const response = await requestMobileRoute(
      platformProjection,
      { method: 'POST', url: '/mobile/agent-links/claim', body: { code: 'PAIR-CODE' } },
      { platformAgentLinkClient },
    );

    assert.equal(response.status, status);
    assert.equal(typeof response.body.error.message, 'string');
  }
});

test('mobile agent-link claim relays the Platform conflict message verbatim as a 409', async () => {
  const platformMessage = 'This code has expired. Generate a new one on your agent.';
  const platformAgentLinkClient: PlatformAgentLinkClient = {
    async claim() {
      return { kind: 'conflict', message: platformMessage };
    },
  };

  const response = await requestMobileRoute(
    platformProjection,
    { method: 'POST', url: '/mobile/agent-links/claim', body: { code: 'PAIR-CODE' } },
    { platformAgentLinkClient },
  );

  assert.equal(response.status, 409);
  assert.equal(response.body.error.code, 'AgentLinkConflict');
  assert.equal(response.body.error.message, platformMessage);
});

test('Platform agent-link client relays the private agent as a slim connected agent', async () => {
  const previousPlatformUrl = process.env.PLATFORM_API_BASE_URL;
  process.env.PLATFORM_API_BASE_URL = 'https://platform.example';

  try {
    const fetchImpl: typeof fetch = async (input, init) => {
      assert.equal(String(input), 'https://platform.example/api/platform/mobile/agent-links/claim');
      assert.equal(init?.method, 'POST');
      assert.equal(init?.body, JSON.stringify({ code: 'PAIR-CODE' }));
      return new Response(
        JSON.stringify({ ok: true, agent: { id: 42, name: 'Atlas', slug: 'atlas', status: 'ready' } }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      );
    };
    const client = createPlatformAgentLinkClient(fetchImpl);

    const result = await client.claim({ authorization: 'Bearer mobile-token' }, 'PAIR-CODE');

    assert.equal(result.kind, 'ok');
    if (result.kind === 'ok') {
      assert.deepEqual(result.data, { connectedAgent: { id: '42', name: 'Atlas' } });
    }
  } finally {
    if (previousPlatformUrl === undefined) {
      delete process.env.PLATFORM_API_BASE_URL;
    } else {
      process.env.PLATFORM_API_BASE_URL = previousPlatformUrl;
    }
  }
});

test('Platform agent-link client reports an unrecognized code as not_found', async () => {
  const previousPlatformUrl = process.env.PLATFORM_API_BASE_URL;
  process.env.PLATFORM_API_BASE_URL = 'https://platform.example';

  try {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ error: { message: 'not found' } }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    const client = createPlatformAgentLinkClient(fetchImpl);

    const result = await client.claim({}, 'PAIR-CODE');
    assert.equal(result.kind, 'not_found');
  } finally {
    if (previousPlatformUrl === undefined) {
      delete process.env.PLATFORM_API_BASE_URL;
    } else {
      process.env.PLATFORM_API_BASE_URL = previousPlatformUrl;
    }
  }
});

test('Platform agent-link client relays 409 envelope messages verbatim as conflict', async () => {
  const previousPlatformUrl = process.env.PLATFORM_API_BASE_URL;
  process.env.PLATFORM_API_BASE_URL = 'https://platform.example';

  try {
    for (const platformMessage of [
      'This code has expired. Generate a new one on your agent.',
      'This agent is already connected to a different account.',
    ]) {
      const fetchImpl: typeof fetch = async () =>
        new Response(
          JSON.stringify({
            error: {
              code: 'conflict',
              product: 'platform',
              status: 409,
              path: '/api/platform/mobile/agent-links/claim',
              request_id: null,
              message: platformMessage,
            },
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } },
        );
      const client = createPlatformAgentLinkClient(fetchImpl);

      const result = await client.claim({}, 'PAIR-CODE');
      assert.equal(result.kind, 'conflict');
      if (result.kind === 'conflict') {
        assert.equal(result.message, platformMessage);
      }
    }
  } finally {
    if (previousPlatformUrl === undefined) {
      delete process.env.PLATFORM_API_BASE_URL;
    } else {
      process.env.PLATFORM_API_BASE_URL = previousPlatformUrl;
    }
  }
});

test('Platform agent-link client treats a 409 without a readable envelope as a contract mismatch', async () => {
  const previousPlatformUrl = process.env.PLATFORM_API_BASE_URL;
  process.env.PLATFORM_API_BASE_URL = 'https://platform.example';

  try {
    const fetchImpl: typeof fetch = async () =>
      new Response('conflict', { status: 409, headers: { 'Content-Type': 'text/plain' } });
    const client = createPlatformAgentLinkClient(fetchImpl);

    const result = await client.claim({}, 'PAIR-CODE');
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

test('mobile Regent state can be sourced from the Platform projection contract', async () => {
  const regents = await listRegentsForUserFromPlatformProjection('platform-user', platformProjection);
  const detail = await getRegentForUserFromPlatformProjection('platform-user', 'atlas-capital', platformProjection);

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
      destinationWalletAddress: expectedRegentWallet,
      chainId: 8453,
      tokenAddress: expectedFundingToken,
      tokenDecimals: 6,
      expectedSigner,
      to: expectedFundingToken,
      value: '0',
      data: fundingTransferData({ recipient: expectedRegentWallet }),
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

test('wallet action prepare caps and sanitizes risk copy', async () => {
  const projection = publicSlugProjection();
  const baseBody = {
    regentId: 'atlas-public',
    expectedSigner,
    to: expectedRecipient,
    value: '0',
    data: expectedData,
    amount: '25',
    currency: 'USDC',
  };

  const tooLong = await requestMobileRoute(projection, {
    method: 'POST',
    url: '/mobile/wallet-actions/funding/prepare',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': 'risk-copy-too-long',
    },
    body: { ...baseBody, riskCopy: 'a'.repeat(201) },
  });
  assert.equal(tooLong.status, 400);

  const markupOnly = await requestMobileRoute(projection, {
    method: 'POST',
    url: '/mobile/wallet-actions/funding/prepare',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': 'risk-copy-markup-only',
    },
    body: { ...baseBody, riskCopy: '<script></script> ' },
  });
  assert.equal(markupOnly.status, 400);

  const sanitized = await requestMobileRoute(projection, {
    method: 'POST',
    url: '/mobile/wallet-actions/funding/prepare',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': 'risk-copy-sanitized',
    },
    body: { ...baseBody, riskCopy: '<b>You are sending</b> 25\u0000 USDC\r\nto Atlas.' },
  });
  assert.equal(sanitized.status, 201);
  assert.equal(sanitized.body.wallet_action.risk_copy, 'You are sending 25 USDC to Atlas.');
});

test('funding intents reject transfer details for a different recipient or amount', async () => {
  const projection = publicSlugProjection();
  const baseBody = {
    amount: '25',
    currency: 'USDC',
    sourceWalletAddress: expectedSigner,
    destinationWalletAddress: expectedRegentWallet,
    chainId: 8453,
    tokenAddress: expectedFundingToken,
    tokenDecimals: 6,
    expectedSigner,
    to: expectedFundingToken,
    value: '0',
    data: fundingTransferData({ recipient: expectedRegentWallet }),
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

  const wrongRegentWallet = await requestMobileRoute(projection, {
    method: 'POST',
    url: '/mobile/regents/atlas-public/funding-intents',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': 'wrong-regent-wallet',
    },
    body: {
      ...baseBody,
      destinationWalletAddress: expectedRecipient,
      data: fundingTransferData({ recipient: expectedRecipient }),
    },
  });
  assert.equal(wrongRegentWallet.status, 400);
  assert.equal(wrongRegentWallet.body.error.message, 'Funding destination must match this Regent wallet.');
});

test('funding intents check transfer amounts using the supplied token decimals', async () => {
  const projection = publicSlugProjection();
  const baseBody = {
    amount: '25',
    currency: 'DAI',
    sourceWalletAddress: expectedSigner,
    destinationWalletAddress: expectedRegentWallet,
    chainId: 8453,
    tokenAddress: expectedFundingToken,
    tokenDecimals: 18,
    expectedSigner,
    to: expectedFundingToken,
    value: '0',
    data: fundingTransferData({ recipient: expectedRegentWallet, decimals: 18 }),
  };

  const accepted = await requestMobileRoute(projection, {
    method: 'POST',
    url: '/mobile/regents/atlas-public/funding-intents',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': 'eighteen-decimals',
    },
    body: baseBody,
  });
  assert.equal(accepted.status, 201);
  assert.equal(accepted.body.fundingIntent.amount, '25');

  const sixDecimalData = await requestMobileRoute(projection, {
    method: 'POST',
    url: '/mobile/regents/atlas-public/funding-intents',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': 'eighteen-decimals-mismatch',
    },
    body: {
      ...baseBody,
      data: fundingTransferData({ recipient: expectedRegentWallet, decimals: 6 }),
    },
  });
  assert.equal(sixDecimalData.status, 400);

  const { tokenDecimals: _omitted, ...bodyWithoutDecimals } = baseBody;
  const missingDecimals = await requestMobileRoute(projection, {
    method: 'POST',
    url: '/mobile/regents/atlas-public/funding-intents',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': 'missing-decimals',
    },
    body: bodyWithoutDecimals,
  });
  assert.equal(missingDecimals.status, 400);
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

test('mobile message and money routes remain mounted through the extracted router', async () => {
  const routePaths = listRoutePaths();
  assert.ok(routePaths.includes('/mobile/message/threads'));
  assert.ok(routePaths.includes('/mobile/message/threads/:thread_id'));
  assert.ok(routePaths.includes('/mobile/message/threads/:thread_id/events'));
  assert.ok(routePaths.includes('/mobile/message/threads/:thread_id/messages'));
  assert.ok(routePaths.includes('/mobile/message/threads/:thread_id/approvals/:approval_id'));
  assert.ok(!routePaths.includes('/mobile/message/contacts/recent-addresses'));
  assert.ok(!routePaths.includes('/mobile/message/contacts/regent-users'));
  assert.ok(!routePaths.includes('/mobile/message/xmtp/phone-identities'));
  assert.ok(!routePaths.includes('/mobile/message/xmtp/agents/:agent_id'));
  assert.ok(!routePaths.includes('/mobile/message/threads/:thread_id/xmtp-links'));
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

  const threads = await listMessageThreads(platformRwrClient, {});
  assert.equal(threads.kind, 'ok');
  if (threads.kind === 'ok') {
    assert.ok(threads.data.length > 0);
  }
});

test('mobile Message threads are sourced from Platform RWR only', async () => {
  const threads = await requestMobileRoute(platformProjection, {
    method: 'GET',
    url: '/mobile/message/threads',
  }, { platformRwrClient });
  assert.equal(threads.status, 200);
  assert.equal(threads.body.threads[0].id, '101~201');
  assert.equal(threads.body.threads[0].source, 'platform_rwr');
  assert.equal(Object.prototype.hasOwnProperty.call(threads.body.threads[0], 'xmtpLinks'), false);
});

test('freshly formed Platform companies appear as chattable mobile Message threads before work exists', async () => {
  const freshFormationClient: PlatformRwrClient = {
    ...platformRwrClient,
    async fetchWorkItems() {
      return { kind: 'ok', data: [] };
    },
  };

  const threads = await listMessageThreads(freshFormationClient, {});
  assert.equal(threads.kind, 'ok');
  if (threads.kind !== 'ok') {
    return;
  }

  assert.equal(threads.data.length, 1);
  assert.equal(threads.data[0]?.id, '101');
  assert.equal(threads.data[0]?.agentId, 'atlas-capital');
  assert.equal(threads.data[0]?.agentName, 'Atlas Capital');
  assert.equal(threads.data[0]?.latestNote, 'Send a message to start.');
});

test('posting to a fresh company thread materializes the Platform work item and run', async () => {
  const calls: unknown[] = [];
  const freshFormationClient: PlatformRwrClient = {
    ...platformRwrClient,
    async fetchWorkItems() {
      return { kind: 'ok', data: [] };
    },
    async createWorkItem(auth, companyId, input) {
      calls.push({ method: 'createWorkItem', auth, companyId, input });
      return platformRwrClient.createWorkItem(auth, companyId, input);
    },
    async startRun(auth, companyId, workItemId, input) {
      calls.push({ method: 'startRun', auth, companyId, workItemId, input });
      return platformRwrClient.startRun(auth, companyId, workItemId, input);
    },
  };

  const updated = await postMessageThreadMessage(freshFormationClient, {}, '101', 'Hello from mobile.');
  assert.equal(updated.kind, 'ok');
  if (updated.kind !== 'ok') {
    return;
  }

  assert.equal(updated.data.id, '101~202~301');
  assert.deepEqual(calls, [
    {
      method: 'createWorkItem',
      auth: {},
      companyId: 101,
      input: {
        title: 'Atlas Capital mobile conversation',
        description: 'Started from mobile.',
        visibility: 'operator',
        metadata: { source: 'regents-mobile', agent_slug: 'atlas-capital' },
      },
    },
    {
      method: 'startRun',
      auth: {},
      companyId: 101,
      workItemId: 202,
      input: {
        instructions: 'Hello from mobile.',
        metadata: { source: 'regents-mobile', message_source: 'text' },
      },
    },
  ]);
});

test('posting to the returned run thread polls that run and reuses the work item for later sends', async () => {
  const calls: Array<{ method: string; companyId?: number; workItemId?: number; runId?: number; input?: unknown }> = [];
  const workItems: RwrWorkItem[] = [];
  let nextRunId = 301;
  const freshFormationClient: PlatformRwrClient = {
    ...platformRwrClient,
    async fetchWorkItems(auth, companyId) {
      calls.push({ method: 'fetchWorkItems', companyId });
      return { kind: 'ok', data: workItems };
    },
    async createWorkItem(auth, companyId, input) {
      calls.push({ method: 'createWorkItem', companyId, input });
      const created = await platformRwrClient.createWorkItem(auth, companyId, input);
      if (created.kind === 'ok') {
        workItems.push(created.data);
      }
      return created;
    },
    async startRun(auth, companyId, workItemId, input) {
      calls.push({ method: 'startRun', companyId, workItemId, input });
      const run = await platformRwrClient.startRun(auth, companyId, workItemId, input);
      if (run.kind !== 'ok') {
        return run;
      }

      return {
        kind: 'ok' as const,
        data: {
          ...run.data,
          id: nextRunId++,
        },
      };
    },
    async fetchRunEvents(auth, companyId, runId) {
      calls.push({ method: 'fetchRunEvents', companyId, runId });
      return platformRwrClient.fetchRunEvents(auth, companyId, runId);
    },
  };

  const first = await postMessageThreadMessage(freshFormationClient, {}, '101', 'Hello from mobile.');
  assert.equal(first.kind, 'ok');
  if (first.kind !== 'ok') {
    return;
  }
  assert.equal(first.data.id, '101~202~301');

  const events = await getMessageThreadEvents(freshFormationClient, {}, first.data.id);
  assert.equal(events.kind, 'ok');

  const second = await postMessageThreadMessage(freshFormationClient, {}, first.data.id, 'Second message.');
  assert.equal(second.kind, 'ok');

  assert.equal(workItems.length, 1);
  assert.equal(calls.filter((call) => call.method === 'createWorkItem').length, 1);
  assert.deepEqual(
    calls.filter((call) => call.method === 'startRun').map((call) => call.workItemId),
    [202, 202],
  );
  assert.ok(calls.some((call) => call.method === 'fetchRunEvents' && call.runId === 301));
});

test('mobile message routes accept push payload thread IDs shaped as company work item and run', async () => {
  const response = await requestMobileRoute(platformProjection, {
    method: 'GET',
    url: '/mobile/message/threads/101~202~301',
  }, { platformRwrClient });

  assert.equal(response.status, 200);
  assert.equal(response.body.thread.id, '101~202~301');
});

test('mobile message thread routes reject malformed thread IDs with 400', async () => {
  const response = await requestMobileRoute(platformProjection, {
    method: 'GET',
    url: '/mobile/message/threads/101~202abc',
  }, { platformRwrClient });

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'BadRequest');
});

test('mobile message approval routes reject malformed approval IDs with 400', async () => {
  const response = await requestMobileRoute(platformProjection, {
    method: 'POST',
    url: '/mobile/message/threads/101~202~301/approvals/abc',
    body: { decision: 'approved' },
  }, { platformRwrClient });

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'BadRequest');
});

test('mobile Regent wallet intent state is written to shared Redis storage', async () => {
  const redis = createFakeSharedStateRedis();
  const created = await createRegentReturnRequestForUser(
    'durable-user',
    'atlas-capital',
    expectedReturnInput({ amount: '12' }),
    'durable-return',
    redis,
  );

  assert.ok(created);
  const persisted = redis.store.get('mobile-regent-state');
  assert.ok(persisted);
  assert.match(persisted, /atlas-capital/);
  assert.deepEqual(await getRegentReturnRequestForUser('durable-user', 'atlas-capital', created.id, redis), created);
});

test('mobile message threads and messages are sourced from Platform RWR', async () => {
  const created = await createMessageThread(platformRwrClient, {}, { agentId: '101', agentName: 'Atlas Capital' });
  assert.equal(created.kind, 'ok');
  if (created.kind !== 'ok') {
    return;
  }

  const updated = await postMessageThreadMessage(platformRwrClient, {}, created.data.id, 'Review this from mobile.');
  assert.equal(updated.kind, 'ok');
});

test('mobile message approvals resolve through Platform RWR', async () => {
  const result = await resolveMessageThreadApproval(platformRwrClient, {}, '101~202~301', '501', 'approved');
  assert.equal(result.kind, 'ok');
});

test('mobile message thread detail carries the full structured approval schema', async () => {
  const session = await getMessageThread(platformRwrClient, {}, '101~202~301');
  assert.equal(session.kind, 'ok');
  if (session.kind !== 'ok') {
    return;
  }

  const approval = session.data.pendingApproval;
  assert.ok(approval);
  assert.equal(approval.requestId, '501');
  assert.equal(approval.action, 'transfer');
  assert.equal(approval.regentName, 'Atlas Capital');
  assert.equal(approval.riskCopy, 'Approve the treasury transfer.');
  assert.equal(approval.amount, '500');
  assert.equal(approval.currency, 'USDC');
  assert.equal(approval.amountUsd, '500.00');
  assert.equal(approval.contractAddress, '0x4444444444444444444444444444444444444444');
  assert.equal(approval.expiresAt, '2026-04-18T00:00:00.000Z');
  assert.equal(approval.resolved, false);
});

test('mobile message approvals without a Platform expiry or USD value omit those fields', async () => {
  const noExpiryClient: PlatformRwrClient = {
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
            expires_at: null,
            created_at: '2026-04-17T23:50:00.000Z',
            updated_at: '2026-04-17T23:50:00.000Z',
          },
        ],
      };
    },
  };

  const session = await getMessageThread(noExpiryClient, {}, '101~202~301');
  assert.equal(session.kind, 'ok');
  if (session.kind !== 'ok') {
    return;
  }

  const approval = session.data.pendingApproval;
  assert.ok(approval);
  assert.equal(approval.expiresAt, undefined);
  assert.equal(approval.amountUsd, undefined);
  assert.equal(approval.resolved, false);
});

test('mobile message events expose explicit approval review fields and event polling markers', async () => {
  const first = await getMessageThreadEvents(platformRwrClient, {}, '101~202~301');
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
  assert.equal(approvalEvent.amountUsd, '500.00');
  assert.equal(approvalEvent.contractAddress, '0x4444444444444444444444444444444444444444');

  const latestEvent = first.data.at(-1);
  assert.ok(latestEvent?.eventId);
  const next = await getMessageThreadEvents(platformRwrClient, {}, '101~202~301', latestEvent.eventId);
  assert.equal(next.kind, 'ok');
  if (next.kind === 'ok') {
    assert.deepEqual(next.data, []);
  }
});

test('mobile message event polling returns only the approval decision after approval resolves', async () => {
  const first = await getMessageThreadEvents(platformRwrClient, {}, '101~202~301');
  assert.equal(first.kind, 'ok');
  if (first.kind !== 'ok') {
    return;
  }

  const requestEvent = first.data.find((event) => event.type === 'tool.request');
  assert.equal(requestEvent?.eventId, 'approval:501:requested');

  const next = await getMessageThreadEvents(resolvedApprovalClient, {}, '101~202~301', requestEvent.eventId);
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

test('return requests require a confirmed Base receipt before completion', async () => {
  const created = await createRegentReturnRequestForUser(
    'receipt-user',
    'atlas-capital',
    expectedReturnInput(),
    'return-receipt-test',
  );
  assert.ok(created);

  const rejected = await confirmRegentReturnRequestForUser('receipt-user', 'atlas-capital', created.id, {
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

  const confirmed = await confirmRegentReturnRequestForUser('receipt-user', 'atlas-capital', created.id, confirmedReceipt());
  assert.equal(confirmed.kind, 'ok');
  if (confirmed.kind === 'ok') {
    assert.equal(confirmed.returnRequest.status, 'confirmed');
  }
});

test('return request confirmation rejects receipts for the wrong transaction details', async () => {
  const created = await createRegentReturnRequestForUser(
    'return-mismatch-user',
    'atlas-capital',
    expectedReturnInput(),
    'return-mismatch-test',
  );
  assert.ok(created);

  assert.equal(
    (await confirmRegentReturnRequestForUser(
      'return-mismatch-user',
      'atlas-capital',
      created.id,
      confirmedReceipt({ from: '0x3333333333333333333333333333333333333333' }),
    )).kind,
    'conflict',
  );
  assert.equal(
    (await confirmRegentReturnRequestForUser(
      'return-mismatch-user',
      'atlas-capital',
      created.id,
      confirmedReceipt({ to: '0x3333333333333333333333333333333333333333' }),
    )).kind,
    'conflict',
  );
  assert.equal(
    (await confirmRegentReturnRequestForUser(
      'return-mismatch-user',
      'atlas-capital',
      created.id,
      confirmedReceipt({ value: '1' }),
    )).kind,
    'conflict',
  );
  assert.equal(
    (await confirmRegentReturnRequestForUser(
      'return-mismatch-user',
      'atlas-capital',
      created.id,
      confirmedReceipt({ data: '0x1234' }),
    )).kind,
    'conflict',
  );
});

test('funding intents are idempotent and keep expected Base funding details', async () => {
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
  const first = await createRegentFundingIntentForUser('funding-user', 'atlas-capital', input, 'fund-once');
  const second = await createRegentFundingIntentForUser('funding-user', 'atlas-capital', input, 'fund-once');

  assert.ok(first);
  assert.deepEqual(second, first);
  assert.equal(first.chainId, 8453);
  assert.equal(first.currency, 'USDC');
  assert.equal(first.expectedSigner, expectedSigner);
  assert.equal(first.to, '0x3333333333333333333333333333333333333333');
  assert.equal(first.value, '0');
  assert.equal(first.data, fundingTransferData());
});

test('funding intents can be fetched and confirmed from matching Base receipts', async () => {
  const created = await createRegentFundingIntentForUser(
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

  const fetched = await getRegentFundingIntentForUser('funding-confirm-user', 'atlas-capital', created.id);
  assert.deepEqual(fetched, created);

  const rejected = await confirmRegentFundingIntentForUser(
    'funding-confirm-user',
    'atlas-capital',
    created.id,
    confirmedReceipt({ to: '0x4444444444444444444444444444444444444444', data: fundingTransferData() }),
  );
  assert.equal(rejected.kind, 'conflict');

  const confirmed = await confirmRegentFundingIntentForUser(
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

test('prepared wallet actions expire and confirm from Base receipts only', async () => {
  const action = await prepareWalletActionForUser('wallet-action-user', 'funding', expectedWalletActionInput());

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

test('prepared wallet actions support funding and returns with the same required fields', async () => {
  for (const type of ['funding', 'return'] as const) {
    const action = await prepareWalletActionForUser(
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

test('prepared wallet actions reuse the same idempotency key for duplicate prepares', async () => {
  const input = expectedWalletActionInput({
    idempotencyKey: 'duplicate-wallet-action-key',
  });
  const first = await prepareWalletActionForUser('duplicate-wallet-action-user', 'funding', input);
  const second = await prepareWalletActionForUser('duplicate-wallet-action-user', 'funding', input);

  assert.ok(first);
  assert.ok(second);
  assert.equal(second.action_id, first.action_id);
  assert.equal(second.expires_at, first.expires_at);
  assert.equal(second.risk_copy, first.risk_copy);

  const confirmed = await confirmPreparedWalletActionForUser(first.action_id, confirmedReceipt());
  assert.equal(confirmed.kind, 'ok');

  const afterConfirm = await prepareWalletActionForUser('duplicate-wallet-action-user', 'funding', input);
  assert.ok(afterConfirm);
  assert.equal(afterConfirm.action_id, first.action_id);
  assert.equal(afterConfirm.status, 'confirmed');
});

test('prepared wallet actions reject receipts for the wrong transaction details', async () => {
  const action = await prepareWalletActionForUser(
    'wallet-action-user',
    'funding',
    expectedWalletActionInput({ idempotencyKey: 'wallet-action-conflict-key' }),
  );
  assert.ok(action);

  assert.equal(
    (await confirmPreparedWalletActionForUser(
      action.action_id,
      confirmedReceipt({ from: '0x3333333333333333333333333333333333333333' }),
    )).kind,
    'conflict',
  );
  assert.equal(
    (await confirmPreparedWalletActionForUser(
      action.action_id,
      confirmedReceipt({ to: '0x3333333333333333333333333333333333333333' }),
    )).kind,
    'conflict',
  );
  assert.equal((await confirmPreparedWalletActionForUser(action.action_id, confirmedReceipt({ value: '1' }))).kind, 'conflict');
  assert.equal(
    (await confirmPreparedWalletActionForUser(action.action_id, confirmedReceipt({ data: '0x1234' }))).kind,
    'conflict',
  );
  assert.equal((await confirmPreparedWalletActionForUser(action.action_id, confirmedReceipt())).kind, 'ok');
});

test('prepared wallet actions cannot be confirmed after their expiry time', async () => {
  const action = await prepareWalletActionForUser(
    'expired-wallet-action-user',
    'funding',
    expectedWalletActionInput({ idempotencyKey: 'expired-wallet-action-key' }),
  );
  assert.ok(action);

  const result = await confirmPreparedWalletActionForUser(
    action.action_id,
    confirmedReceipt(),
    new Date(Date.parse(action.expires_at)),
  );

  assert.equal(result.kind, 'expired');
  if (result.kind === 'expired') {
    assert.equal(result.action.status, 'expired');
  }
});

test('expired prepared wallet actions report expiry before receipt mismatches', async () => {
  const action = await prepareWalletActionForUser(
    'expired-wallet-action-mismatch-user',
    'funding',
    expectedWalletActionInput({
      idempotencyKey: 'expired-wallet-action-mismatch-key',
    }),
  );
  assert.ok(action);

  const result = await confirmPreparedWalletActionForUser(
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

test('finished wallet intents are pruned after retention while live intents are kept', async () => {
  const awaiting = await createRegentReturnRequestForUser(
    'prune-user',
    'atlas-capital',
    expectedReturnInput(),
    'prune-return-live',
  );
  assert.ok(awaiting);

  const finished = await createRegentReturnRequestForUser(
    'prune-user',
    'atlas-capital',
    expectedReturnInput(),
    'prune-return-done',
  );
  assert.ok(finished);
  assert.equal(
    (await confirmRegentReturnRequestForUser('prune-user', 'atlas-capital', finished.id, confirmedReceipt())).kind,
    'ok',
  );

  const funding = await createRegentFundingIntentForUser(
    'prune-user',
    'atlas-capital',
    {
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
    },
    'prune-funding-live',
  );
  assert.ok(funding);

  const action = await prepareWalletActionForUser(
    'prune-user',
    'funding',
    expectedWalletActionInput({ idempotencyKey: 'prune-action' }),
  );
  assert.ok(action);

  await pruneMobileRegentState(new Date(Date.now() + 31 * 24 * 60 * 60 * 1000));

  // Intents that can still be acted on are never dropped.
  assert.ok(await getRegentReturnRequestForUser('prune-user', 'atlas-capital', awaiting.id));
  assert.ok(await getRegentFundingIntentForUser('prune-user', 'atlas-capital', funding.id));

  // Terminal and long-expired records are pruned.
  assert.equal(await getRegentReturnRequestForUser('prune-user', 'atlas-capital', finished.id), null);
  assert.equal((await confirmPreparedWalletActionForUser(action.action_id, confirmedReceipt())).kind, 'not_found');
});

test('voice session records are pruned once finished and no longer live', async () => {
  const sessionInput = {
    userId: 'prune-voice-user',
    agentId: 'atlas-capital',
    provider: 'openai-realtime' as const,
    model: 'gpt-realtime',
    toolRegistryDigest: 'digest',
    safetyIdentifierHash: 'hash',
  };

  const live = await createMobileVoiceSessionRecord({
    ...sessionInput,
    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
  });
  const finished = await createMobileVoiceSessionRecord({
    ...sessionInput,
    expiresAt: new Date(Date.now() + 60 * 1000).toISOString(),
  });
  await disconnectMobileVoiceSession({
    userId: sessionInput.userId,
    agentId: sessionInput.agentId,
    sessionId: finished.id,
  });

  await pruneMobileVoiceSessions(new Date(Date.now() + 25 * 60 * 60 * 1000));

  const state = await readMobileVoiceSessionStateForTests();
  assert.ok(state.sessions[live.id]);
  assert.equal(state.sessions[finished.id], undefined);
});

test('voice session records are capped so the shared state stays bounded', async () => {
  for (let index = 0; index < 505; index += 1) {
    await createMobileVoiceSessionRecord({
      userId: 'cap-voice-user',
      agentId: 'atlas-capital',
      provider: 'openai-realtime',
      model: 'gpt-realtime',
      toolRegistryDigest: 'digest',
      safetyIdentifierHash: 'hash',
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
  }

  const state = await readMobileVoiceSessionStateForTests();
  assert.ok(Object.keys(state.sessions).length <= 501);
});

test('funding intents keep full money-path semantics on the Redis-backed store', async () => {
  const redis = createFakeSharedStateRedis();
  const input = {
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

  const first = await createRegentFundingIntentForUser('redis-funding-user', 'atlas-capital', input, 'redis-fund', redis);
  const duplicate = await createRegentFundingIntentForUser(
    'redis-funding-user',
    'atlas-capital',
    input,
    'redis-fund',
    redis,
  );
  assert.ok(first);
  assert.deepEqual(duplicate, first);
  assert.match(redis.store.get('mobile-regent-state') ?? '', /redis-fund/);

  const fetched = await getRegentFundingIntentForUser('redis-funding-user', 'atlas-capital', first.id, redis);
  assert.deepEqual(fetched, first);

  const rejected = await confirmRegentFundingIntentForUser(
    'redis-funding-user',
    'atlas-capital',
    first.id,
    confirmedReceipt({ to: '0x4444444444444444444444444444444444444444', data: fundingTransferData() }),
    redis,
  );
  assert.equal(rejected.kind, 'conflict');

  const confirmed = await confirmRegentFundingIntentForUser(
    'redis-funding-user',
    'atlas-capital',
    first.id,
    confirmedReceipt({ to: expectedFundingToken, data: fundingTransferData() }),
    redis,
  );
  assert.equal(confirmed.kind, 'ok');
  if (confirmed.kind === 'ok') {
    assert.equal(confirmed.fundingIntent.status, 'confirmed');
    assert.equal(confirmed.fundingIntent.txHash, `0x${'1'.repeat(64)}`);
  }
});

test('concurrent Redis-backed writes never lose an intent', async () => {
  const redis = createFakeSharedStateRedis();

  const [first, second] = await Promise.all([
    createRegentReturnRequestForUser('race-user', 'atlas-capital', expectedReturnInput(), 'race-return-a', redis),
    createRegentReturnRequestForUser('race-user', 'atlas-capital', expectedReturnInput(), 'race-return-b', redis),
  ]);
  assert.ok(first);
  assert.ok(second);

  // Both writers raced on the same shared state; compare-and-swap must keep both records.
  assert.ok(await getRegentReturnRequestForUser('race-user', 'atlas-capital', first.id, redis));
  assert.ok(await getRegentReturnRequestForUser('race-user', 'atlas-capital', second.id, redis));
});

test('prepared wallet actions expire on the Redis-backed store exactly as before', async () => {
  const redis = createFakeSharedStateRedis();
  const action = await prepareWalletActionForUser(
    'redis-wallet-action-user',
    'funding',
    expectedWalletActionInput({ idempotencyKey: 'redis-wallet-action-key' }),
    redis,
  );
  assert.ok(action);

  const ttlMs = Date.parse(action.expires_at) - Date.now();
  assert.ok(ttlMs > 9 * 60 * 1000);
  assert.ok(ttlMs <= 10 * 60 * 1000);

  const expired = await confirmPreparedWalletActionForUser(
    action.action_id,
    confirmedReceipt(),
    new Date(Date.parse(action.expires_at)),
    redis,
  );
  assert.equal(expired.kind, 'expired');

  const stillExpired = await confirmPreparedWalletActionForUser(action.action_id, confirmedReceipt(), new Date(), redis);
  assert.equal(stillExpired.kind, 'expired');
});

test('voice sessions live in the Redis-backed store and prune there', async () => {
  const redis = createFakeSharedStateRedis();
  const sessionInput = {
    userId: 'redis-voice-user',
    agentId: 'atlas-capital',
    provider: 'openai-realtime' as const,
    model: 'gpt-realtime',
    toolRegistryDigest: 'digest',
    safetyIdentifierHash: 'hash',
  };

  const live = await createMobileVoiceSessionRecord({
    ...sessionInput,
    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
  }, redis);
  const finished = await createMobileVoiceSessionRecord({
    ...sessionInput,
    expiresAt: new Date(Date.now() + 60 * 1000).toISOString(),
  }, redis);

  const disconnected = await disconnectMobileVoiceSession({
    userId: sessionInput.userId,
    agentId: sessionInput.agentId,
    sessionId: finished.id,
  }, redis);
  assert.equal(disconnected?.status, 'disconnected');

  // Only the still-live session remains active once the other disconnects.
  assert.equal((await getActiveMobileVoiceSession('redis-voice-user', 'atlas-capital', redis))?.id, live.id);

  await pruneMobileVoiceSessions(new Date(Date.now() + 25 * 60 * 60 * 1000), redis);

  const state = await readMobileVoiceSessionStateForTests(redis);
  assert.ok(state.sessions[live.id]);
  assert.equal(state.sessions[finished.id], undefined);
  assert.match(redis.store.get('mobile-voice-sessions') ?? '', new RegExp(live.id));
});
