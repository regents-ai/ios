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
import { resetMobileVoiceSessionsForTests } from './mobileVoiceSessions.js';
import {
  createTerminalSession,
  getTerminalEvents,
  listTerminalSessions,
  postTerminalMessage,
  resolveTerminalApproval,
} from './mobileTerminal.js';
import { registerPhoneXmtpIdentityForUser, resetMobileMessageStateForTests } from './mobileMessages.js';
import {
  createPlatformStakingClient,
  type PlatformProjection,
  type PlatformRwrClient,
  type PlatformStakingClient,
} from './platformProjection.js';
import type { HermesVoiceClient } from './services/hermesVoiceClient.js';

beforeEach(() => {
  resetMobileRegentStateForTests();
  resetMobileMessageStateForTests();
  resetMobileVoiceSessionsForTests();
});

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

test('mobile terminal and money routes remain mounted through the extracted router', async () => {
  const routePaths = listRoutePaths();
  assert.ok(routePaths.includes('/mobile/terminal/sessions'));
  assert.ok(routePaths.includes('/mobile/message/threads'));
  assert.ok(routePaths.includes('/mobile/message/contacts/recent-addresses'));
  assert.ok(routePaths.includes('/mobile/message/contacts/regent-users'));
  assert.ok(routePaths.includes('/mobile/message/xmtp/phone-identities'));
  assert.ok(routePaths.includes('/mobile/message/xmtp/agents/:agent_id'));
  assert.ok(routePaths.includes('/mobile/message/threads/:thread_id/xmtp-links'));
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

test('mobile Message XMTP routes mount without an XMTP network dependency', async () => {
  const recentContacts = await requestMobileRoute(platformProjection, {
    method: 'GET',
    url: '/mobile/message/contacts/recent-addresses?addressOrName=atlas.eth',
  }, {
    messageContactClient: {
      async lookupRecentEnsContacts(addressOrName) {
        return {
          kind: 'ok' as const,
          target: {
            input: addressOrName,
            address: expectedSigner,
            ensName: 'atlas.eth',
          },
          contacts: [{
            id: 'recent:vitalik.eth:0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
            kind: 'recent_ens' as const,
            label: 'vitalik.eth',
            address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
            ensName: 'vitalik.eth',
            detail: 'Recent contact',
          }],
        };
      },
    },
  });
  assert.equal(recentContacts.status, 200);
  assert.equal(recentContacts.body.target.ensName, 'atlas.eth');
  assert.equal(recentContacts.body.contacts[0].kind, 'recent_ens');
  assert.equal(recentContacts.body.contacts[0].label, 'vitalik.eth');

  const threads = await requestMobileRoute(platformProjection, {
    method: 'GET',
    url: '/mobile/message/threads',
  }, { platformRwrClient });
  assert.equal(threads.status, 200);
  assert.equal(threads.body.threads[0].id, '101~201');
  assert.equal(threads.body.threads[0].source, 'platform_rwr');
  assert.deepEqual(threads.body.threads[0].xmtpLinks, []);

  const identity = await requestMobileRoute(platformProjection, {
    method: 'POST',
    url: '/mobile/message/xmtp/phone-identities',
    body: {
      inboxId: 'xmtp-inbox-1',
      installationId: 'phone-installation-1',
      walletAddress: expectedSigner,
      environment: 'dev',
    },
  });
  assert.equal(identity.status, 200);
  assert.equal(identity.body.identity.inboxId, 'xmtp-inbox-1');
  assert.equal(identity.body.identity.installationId, 'phone-installation-1');
  assert.equal(identity.body.identity.walletAddress, expectedSigner);
  assert.equal(identity.body.identity.environment, 'dev');
  assert.match(identity.body.identity.registeredAt, /^\d{4}-\d{2}-\d{2}T/);

  registerPhoneXmtpIdentityForUser('another-user', {
    inboxId: 'xmtp-inbox-2',
    installationId: 'phone-installation-2',
    walletAddress: '0x4444444444444444444444444444444444444444',
    environment: 'dev',
  });

  const regentUsers = await requestMobileRoute(platformProjection, {
    method: 'GET',
    url: '/mobile/message/contacts/regent-users',
  });
  assert.equal(regentUsers.status, 200);
  assert.deepEqual(regentUsers.body.contacts.map((contact: { kind: string; label: string; address: string }) => ({
    kind: contact.kind,
    label: contact.label,
    address: contact.address,
  })), [
      {
        kind: 'regent_agent',
        label: 'Atlas Capital',
        address: expectedRegentWallet,
      },
    {
      kind: 'regent_human',
      label: 'You',
      address: expectedSigner,
    },
    {
      kind: 'regent_human',
      label: 'Regent user',
      address: '0x4444444444444444444444444444444444444444',
    },
  ]);

  const linked = await requestMobileRoute(platformProjection, {
    method: 'POST',
    url: '/mobile/message/threads/101~202~301/xmtp-links',
    body: {
      conversationId: 'xmtp-conversation-1',
      conversationKind: 'group',
      environment: 'dev',
    },
  }, { platformRwrClient });
  assert.equal(linked.status, 200);
  assert.equal(linked.body.thread.id, '101~202~301');
  assert.equal(linked.body.thread.platformThreadId, '101~202~301');
  assert.equal(linked.body.thread.agentId, 'atlas-capital');
  assert.equal(linked.body.thread.agentName, 'Atlas Capital');
  assert.equal(linked.body.thread.source, 'platform_rwr');
  assert.deepEqual(linked.body.thread.xmtpLinks.map((link: { conversationId: string; conversationKind: string; environment: string }) => ({
    conversationId: link.conversationId,
    conversationKind: link.conversationKind,
    environment: link.environment,
  })), [
    {
      conversationId: 'xmtp-conversation-1',
      conversationKind: 'group',
      environment: 'dev',
    },
  ]);
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
