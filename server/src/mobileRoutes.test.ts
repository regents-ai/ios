import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test, { beforeEach } from 'node:test';
import type { Request, Response } from 'express';

import {
  confirmPreparedWalletActionForUser,
  confirmRegentFundingIntentForUser,
  confirmRegentReturnRequestForUser,
  createRegentFundingIntentForUser,
  createRegentReturnRequestForUser,
  getBaseRegentSnapshotForUser,
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
import type { PlatformProjection, PlatformRwrClient } from './platformProjection.js';

beforeEach(() => {
  resetMobileRegentStateForTests();
});

function listRoutePaths() {
  const router = createMobileRoutes();

  return router.stack
    .map((layer) => layer.route?.path)
    .filter((path): path is string => typeof path === 'string');
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
  }
) {
  const router = createMobileRoutes({
    platformProjectionClient: {
      async fetchProjection() {
        return { kind: 'ok' as const, projection };
      },
    },
  }) as unknown as {
    handle(request: Request, response: Response, next: (error?: unknown) => void): void;
  };

  const headers = Object.fromEntries(
    Object.entries(input.headers || {}).map(([name, value]) => [name.toLowerCase(), value])
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
const expectedData = '0x';

function expectedReturnInput(input?: Partial<{
  amount: string;
  currency: string;
  destinationWalletAddress: string;
  chainId: number;
  expectedSigner: string;
  to: string;
  value: string;
  data: string;
}>) {
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

function confirmedReceipt(input?: Partial<{
  txHash: string;
  chainId: number;
  blockNumber: number;
  status: 'confirmed';
  from: string;
  to: string;
  value: string;
  data: string;
}>) {
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
        companies: [{ id: 101, name: 'Atlas Capital', slug: 'atlas-capital', status: 'active' }],
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

test('mobile Regent Manager route stays mounted and returns the current manager shape', () => {
  const routePaths = listRoutePaths();
  assert.ok(routePaths.includes('/mobile/regents/:id/manager'));

  const body = getRegentManagerForUserFromPlatformProjection('atlas-capital', platformProjection);
  assert.ok(body);
  assert.equal(body.regentId, 'atlas-capital');
  assert.equal(body.dashboardUrl, 'https://atlas.regents.sh');
  assert.equal(body.roster.some((member: { name: string }) => member.name === 'Regent Manager'), true);
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
      tokenAddress: expectedRecipient,
      expectedSigner,
      to: expectedRecipient,
      value: '0',
      data: expectedData,
    },
  });
  assert.equal(fundingResponse.status, 201);
  assert.equal(fundingResponse.body.fundingIntent.regentId, 'atlas-public');

  const snapshotResponse = await requestMobileRoute(projection, {
    method: 'GET',
    url: '/mobile/regents/atlas-public/base-snapshot',
  });
  assert.equal(snapshotResponse.status, 200);
  assert.equal(snapshotResponse.body.snapshot.regentId, 'atlas-public');

  const walletActionResponse = await requestMobileRoute(projection, {
    method: 'POST',
    url: '/mobile/wallet-actions/funding/prepare',
    headers: {
      'Content-Type': 'application/json',
    },
    body: {
      regentId: 'atlas-public',
      expectedSigner,
      to: expectedRecipient,
      value: '0',
      data: expectedData,
      amount: '25',
      currency: 'USDC',
    },
  });
  assert.equal(walletActionResponse.status, 201);
  assert.equal(walletActionResponse.body.action.regentId, 'atlas-public');
});

test('mobile terminal and money routes remain mounted through the extracted router', async () => {
  const routePaths = listRoutePaths();
  assert.ok(routePaths.includes('/mobile/terminal/sessions'));
  assert.ok(routePaths.includes('/mobile/regents/:id/funding-intents'));
  assert.ok(routePaths.includes('/mobile/regents/:id/funding-intents/:fundingIntentId'));
  assert.ok(routePaths.includes('/mobile/regents/:id/funding-intents/:fundingIntentId/confirm'));
  assert.ok(routePaths.includes('/mobile/regents/:id/base-snapshot'));
  assert.ok(routePaths.includes('/mobile/wallet-actions/:type/prepare'));
  assert.ok(routePaths.includes('/mobile/wallet-actions/:actionId/confirm'));

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
    'durable-return'
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

test('return requests require a confirmed Base receipt before completion', () => {
  const created = createRegentReturnRequestForUser(
    'receipt-user',
    'atlas-capital',
    expectedReturnInput(),
    'return-receipt-test'
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
    'return-mismatch-test'
  );
  assert.ok(created);

  assert.equal(
    confirmRegentReturnRequestForUser(
      'return-mismatch-user',
      'atlas-capital',
      created.id,
      confirmedReceipt({ from: '0x3333333333333333333333333333333333333333' })
    ).kind,
    'conflict'
  );
  assert.equal(
    confirmRegentReturnRequestForUser(
      'return-mismatch-user',
      'atlas-capital',
      created.id,
      confirmedReceipt({ to: '0x3333333333333333333333333333333333333333' })
    ).kind,
    'conflict'
  );
  assert.equal(
    confirmRegentReturnRequestForUser(
      'return-mismatch-user',
      'atlas-capital',
      created.id,
      confirmedReceipt({ value: '1' })
    ).kind,
    'conflict'
  );
  assert.equal(
    confirmRegentReturnRequestForUser(
      'return-mismatch-user',
      'atlas-capital',
      created.id,
      confirmedReceipt({ data: '0x1234' })
    ).kind,
    'conflict'
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
    to: expectedRecipient,
    value: '0',
    data: expectedData,
  };
  const first = createRegentFundingIntentForUser('funding-user', 'atlas-capital', input, 'fund-once');
  const second = createRegentFundingIntentForUser('funding-user', 'atlas-capital', input, 'fund-once');

  assert.ok(first);
  assert.deepEqual(second, first);
  assert.equal(first.chainId, 8453);
  assert.equal(first.currency, 'USDC');
  assert.equal(first.expectedSigner, expectedSigner);
  assert.equal(first.to, expectedRecipient);
  assert.equal(first.value, '0');
  assert.equal(first.data, expectedData);
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
      tokenAddress: expectedRecipient,
      expectedSigner,
      to: expectedRecipient,
      value: '0',
      data: expectedData,
    },
    'fund-confirm'
  );
  assert.ok(created);

  const fetched = getRegentFundingIntentForUser('funding-confirm-user', 'atlas-capital', created.id);
  assert.deepEqual(fetched, created);

  const rejected = confirmRegentFundingIntentForUser(
    'funding-confirm-user',
    'atlas-capital',
    created.id,
    confirmedReceipt({ to: '0x3333333333333333333333333333333333333333' })
  );
  assert.equal(rejected.kind, 'conflict');

  const confirmed = confirmRegentFundingIntentForUser(
    'funding-confirm-user',
    'atlas-capital',
    created.id,
    confirmedReceipt()
  );
  assert.equal(confirmed.kind, 'ok');
  if (confirmed.kind === 'ok') {
    assert.equal(confirmed.fundingIntent.status, 'confirmed');
    assert.equal(confirmed.fundingIntent.txHash, `0x${'1'.repeat(64)}`);
  }
});

test('Base snapshots come from the mobile Base snapshot path', () => {
  const snapshot = getBaseRegentSnapshotForUser('snapshot-user', 'atlas-capital');

  assert.ok(snapshot);
  assert.equal(snapshot.chainId, 8453);
  assert.equal(snapshot.stale, true);
  assert.equal(snapshot.blockNumber, 0);
  assert.equal(snapshot.contractAddress, '0x0000000000000000000000000000000000000000');
  assert.equal(snapshot.subjectStatus, 'onchain-read-required');
});

test('prepared wallet actions expire and confirm from Base receipts only', () => {
  const action = prepareWalletActionForUser('wallet-action-user', 'funding', {
    regentId: 'atlas-capital',
    expectedSigner,
    to: expectedRecipient,
    value: '0',
    data: expectedData,
    amount: '25',
    currency: 'USDC',
  });

  assert.ok(action);
  assert.equal(action.type, 'funding');
  assert.equal(action.chainId, 8453);
  assert.equal(action.expectedSigner, expectedSigner);
  assert.match(action.expiresAt, /T/);
  const ttlMs = Date.parse(action.expiresAt) - Date.now();
  assert.ok(ttlMs > 9 * 60 * 1000);
  assert.ok(ttlMs <= 10 * 60 * 1000);
});

test('prepared wallet actions support staking, claiming, funding, and returns with the same required fields', () => {
  for (const type of ['stake', 'claim', 'funding', 'return'] as const) {
    const action = prepareWalletActionForUser(`wallet-action-${type}-user`, type, {
      regentId: 'atlas-capital',
      expectedSigner,
      to: expectedRecipient,
      value: '0',
      data: expectedData,
      amount: '25',
      currency: 'USDC',
    });

    assert.ok(action);
    assert.equal(action.type, type);
    assert.equal(action.regentId, 'atlas-capital');
    assert.equal(action.chainId, 8453);
    assert.equal(action.expectedSigner, expectedSigner);
    assert.equal(action.to, expectedRecipient);
    assert.equal(action.value, '0');
    assert.equal(action.data, expectedData);
  }
});

test('prepared wallet actions reject receipts for the wrong transaction details', () => {
  const action = prepareWalletActionForUser('wallet-action-user', 'funding', {
    regentId: 'atlas-capital',
    expectedSigner,
    to: expectedRecipient,
    value: '0',
    data: expectedData,
    amount: '25',
    currency: 'USDC',
  });
  assert.ok(action);

  assert.equal(confirmPreparedWalletActionForUser(action.id, confirmedReceipt({ from: '0x3333333333333333333333333333333333333333' })).kind, 'conflict');
  assert.equal(confirmPreparedWalletActionForUser(action.id, confirmedReceipt({ to: '0x3333333333333333333333333333333333333333' })).kind, 'conflict');
  assert.equal(confirmPreparedWalletActionForUser(action.id, confirmedReceipt({ value: '1' })).kind, 'conflict');
  assert.equal(confirmPreparedWalletActionForUser(action.id, confirmedReceipt({ data: '0x1234' })).kind, 'conflict');
  assert.equal(confirmPreparedWalletActionForUser(action.id, confirmedReceipt()).kind, 'ok');
});

test('prepared wallet actions cannot be confirmed after their expiry time', () => {
  const action = prepareWalletActionForUser('expired-wallet-action-user', 'funding', {
    regentId: 'atlas-capital',
    expectedSigner,
    to: expectedRecipient,
    value: '0',
    data: expectedData,
    amount: '25',
    currency: 'USDC',
  });
  assert.ok(action);

  const result = confirmPreparedWalletActionForUser(
    action.id,
    confirmedReceipt(),
    new Date(Date.parse(action.expiresAt))
  );

  assert.equal(result.kind, 'expired');
  if (result.kind === 'expired') {
    assert.equal(result.action.status, 'expired');
  }
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
