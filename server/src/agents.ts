type AgentStatus = 'active' | 'attention' | 'paused';
type RuntimeStatus = 'online' | 'waiting' | 'offline';
type WithdrawalStatus = 'requested' | 'approved' | 'broadcasting' | 'confirmed' | 'failed';

export type AgentSummary = {
  id: string;
  name: string;
  status: AgentStatus;
  runtimeStatus: RuntimeStatus;
  walletAddress: string;
  stablecoinSymbol: string;
  stablecoinBalance: string;
  stablecoinBalanceUsd: string;
  lastActiveAt: string;
  treasuryNote?: string;
};

export type AgentActivity = {
  id: string;
  title: string;
  detail: string;
  at: string;
};

export type AgentWithdrawal = {
  id: string;
  agentId: string;
  amount: string;
  currency: string;
  destinationWalletAddress: string;
  status: WithdrawalStatus;
  createdAt: string;
  updatedAt: string;
};

export type AgentDetail = AgentSummary & {
  runtimeHeadline: string;
  mission: string;
  recentActivity: AgentActivity[];
  withdrawals: AgentWithdrawal[];
};

export type PaperclipGoal = {
  id: string;
  title: string;
  status: string;
  note?: string;
};

export type PaperclipTask = {
  id: string;
  title: string;
  status: string;
  owner?: string;
  note?: string;
};

export type PaperclipEvent = {
  id: string;
  title: string;
  detail: string;
  at: string;
};

export type PaperclipRosterMember = {
  id: string;
  name: string;
  role: string;
  status: string;
};

export type PaperclipDetail = {
  agentId: string;
  headline: string;
  companySummary: string;
  dashboardUrl: string;
  goals: PaperclipGoal[];
  activeTasks: PaperclipTask[];
  recentEvents: PaperclipEvent[];
  roster: PaperclipRosterMember[];
};

type AgentRecord = AgentDetail & {
  ownerUserId: string;
  paperclip: PaperclipDetail;
};

const withdrawalIntents = new Map<string, AgentWithdrawal>();

const reviewOwner = 'testflight-reviewer';
const sharedOwner = 'seeded-user';

const seededAgents: AgentRecord[] = [
  {
    ownerUserId: sharedOwner,
    id: 'atlas-capital',
    name: 'Atlas Capital',
    status: 'active',
    runtimeStatus: 'online',
    walletAddress: '0x7aA4fB65E3A74F4797e95aA8ef1Fd54e9b3D0812',
    stablecoinSymbol: 'USDC',
    stablecoinBalance: '14820.42',
    stablecoinBalanceUsd: '14820.42',
    lastActiveAt: '2026-04-17T23:48:00.000Z',
    treasuryNote: 'Ready to fund new runs.',
    runtimeHeadline: 'Online and handling treasury requests.',
    mission: 'Looks after launch budgets, vendor payouts, and treasury buffers for active work.',
    recentActivity: [
      {
        id: 'atlas-activity-1',
        title: 'Treasury top-up received',
        detail: 'The wallet buffer was refreshed for this week’s operating window.',
        at: '2026-04-17T22:40:00.000Z',
      },
      {
        id: 'atlas-activity-2',
        title: 'Runway review completed',
        detail: 'Cash coverage was updated after new settlement data arrived.',
        at: '2026-04-17T19:15:00.000Z',
      },
    ],
    withdrawals: [
      {
        id: 'atlas-withdrawal-1',
        agentId: 'atlas-capital',
        amount: '250.00',
        currency: 'USDC',
        destinationWalletAddress: '0x3F96Ac7F8bA4a4299f7F13A5A6C65ecF6B35a031',
        status: 'confirmed',
        createdAt: '2026-04-16T18:02:00.000Z',
        updatedAt: '2026-04-16T18:07:00.000Z',
      },
    ],
    paperclip: {
      agentId: 'atlas-capital',
      headline: 'Atlas keeps launch budgets funded and watches treasury runway.',
      companySummary: 'Atlas Capital manages short-horizon treasury planning, launch budgets, and payout readiness so operating teams can move without burning through reserve coverage.',
      dashboardUrl: 'https://paperclip.sprites.dev/atlas-capital',
      goals: [
        {
          id: 'atlas-goal-1',
          title: 'Keep four weeks of operating runway in reserve',
          status: 'on track',
          note: 'Reserve coverage is holding above the target window.',
        },
        {
          id: 'atlas-goal-2',
          title: 'Prepare next launch budget before Monday review',
          status: 'in progress',
          note: 'Final vendor estimates are still being folded in.',
        },
      ],
      activeTasks: [
        {
          id: 'atlas-task-1',
          title: 'Review vendor cash window for the launch team',
          status: 'in progress',
          owner: 'Hermes',
          note: 'Waiting on one final quote before the number is locked.',
        },
        {
          id: 'atlas-task-2',
          title: 'Refresh treasury runway summary',
          status: 'queued',
          owner: 'Paperclip',
          note: 'Summary refresh is queued after tonight’s settlements.',
        },
      ],
      recentEvents: [
        {
          id: 'atlas-event-1',
          title: 'Launch budget adjusted',
          detail: 'Atlas raised the launch budget after the latest vendor quote came in higher than expected.',
          at: '2026-04-17T22:18:00.000Z',
        },
        {
          id: 'atlas-event-2',
          title: 'Reserve buffer rechecked',
          detail: 'The reserve buffer still covers the planned payout window after this week’s transfers.',
          at: '2026-04-17T19:42:00.000Z',
        },
      ],
      roster: [
        { id: 'atlas-roster-1', name: 'Hermes', role: 'Operator', status: 'online' },
        { id: 'atlas-roster-2', name: 'Paperclip', role: 'Dashboard', status: 'ready' },
      ],
    },
  },
  {
    ownerUserId: sharedOwner,
    id: 'meridian-ops',
    name: 'Meridian Ops',
    status: 'attention',
    runtimeStatus: 'waiting',
    walletAddress: '0xB0dC814c12b25c7d2B146A4bce0D6A3669817a54',
    stablecoinSymbol: 'USDC',
    stablecoinBalance: '3920.11',
    stablecoinBalanceUsd: '3920.11',
    lastActiveAt: '2026-04-17T21:02:00.000Z',
    treasuryNote: 'Needs a fresh withdrawal review.',
    runtimeHeadline: 'Waiting on operator approval for the next treasury move.',
    mission: 'Covers day-to-day operator spend, reimbursements, and routine transfers.',
    recentActivity: [
      {
        id: 'meridian-activity-1',
        title: 'Withdrawal request staged',
        detail: 'A return transfer back to the mobile wallet is waiting for approval.',
        at: '2026-04-17T20:58:00.000Z',
      },
      {
        id: 'meridian-activity-2',
        title: 'Balance check finished',
        detail: 'The treasury snapshot refreshed after the last payout cycle.',
        at: '2026-04-17T18:22:00.000Z',
      },
    ],
    withdrawals: [
      {
        id: 'meridian-withdrawal-1',
        agentId: 'meridian-ops',
        amount: '140.00',
        currency: 'USDC',
        destinationWalletAddress: '0x3F96Ac7F8bA4a4299f7F13A5A6C65ecF6B35a031',
        status: 'requested',
        createdAt: '2026-04-17T20:58:00.000Z',
        updatedAt: '2026-04-17T20:58:00.000Z',
      },
    ],
    paperclip: {
      agentId: 'meridian-ops',
      headline: 'Meridian tracks routine spend, reimbursements, and return transfers.',
      companySummary: 'Meridian Ops keeps routine operator spending in line, watches reimbursement timing, and stages return transfers when surplus cash should come back to the mobile wallet.',
      dashboardUrl: 'https://paperclip.sprites.dev/meridian-ops',
      goals: [
        {
          id: 'meridian-goal-1',
          title: 'Clear pending withdrawal review',
          status: 'needs attention',
          note: 'A return transfer is waiting for operator approval.',
        },
        {
          id: 'meridian-goal-2',
          title: 'Hold daily spend inside operating range',
          status: 'on track',
          note: 'Daily spend remains inside the planned range.',
        },
      ],
      activeTasks: [
        {
          id: 'meridian-task-1',
          title: 'Stage wallet return transfer',
          status: 'waiting',
          owner: 'Hermes',
          note: 'Waiting for approval before the transfer can continue.',
        },
        {
          id: 'meridian-task-2',
          title: 'Refresh reimbursement queue',
          status: 'in progress',
          owner: 'Paperclip',
          note: 'Receipts from the latest operating cycle are being matched now.',
        },
      ],
      recentEvents: [
        {
          id: 'meridian-event-1',
          title: 'Return transfer staged',
          detail: 'Meridian prepared a transfer back to the mobile wallet and is waiting for approval.',
          at: '2026-04-17T20:58:00.000Z',
        },
        {
          id: 'meridian-event-2',
          title: 'Spend ledger refreshed',
          detail: 'The ledger refreshed after the latest payout cycle closed.',
          at: '2026-04-17T18:22:00.000Z',
        },
      ],
      roster: [
        { id: 'meridian-roster-1', name: 'Hermes', role: 'Operator', status: 'waiting' },
        { id: 'meridian-roster-2', name: 'Paperclip', role: 'Dashboard', status: 'ready' },
      ],
    },
  },
];

const byOwner = new Map<string, AgentRecord[]>();

function cloneAgent(agent: AgentRecord): AgentRecord {
  return {
    ...agent,
    recentActivity: agent.recentActivity.map((item) => ({ ...item })),
    withdrawals: agent.withdrawals.map((item) => ({ ...item })),
    paperclip: {
      ...agent.paperclip,
      goals: agent.paperclip.goals.map((item) => ({ ...item })),
      activeTasks: agent.paperclip.activeTasks.map((item) => ({ ...item })),
      recentEvents: agent.paperclip.recentEvents.map((item) => ({ ...item })),
      roster: agent.paperclip.roster.map((item) => ({ ...item })),
    },
  };
}

function getOwnerStore(userId: string) {
  const ownerId = userId || sharedOwner;
  if (!byOwner.has(ownerId)) {
    const seeded = seededAgents.map((agent) => cloneAgent({ ...agent, ownerUserId: ownerId }));
    byOwner.set(ownerId, seeded);
  }

  return byOwner.get(ownerId)!;
}

function findAgentRecord(userId: string, agentId: string) {
  return getOwnerStore(userId).find((agent) => agent.id === agentId) || null;
}

function toAgentSummary(agent: AgentRecord): AgentSummary {
  const { ownerUserId: _ownerUserId, paperclip: _paperclip, recentActivity: _recentActivity, withdrawals: _withdrawals, runtimeHeadline: _runtimeHeadline, mission: _mission, ...summary } = agent;
  return summary;
}

function toAgentDetail(agent: AgentRecord): AgentDetail {
  return {
    ...toAgentSummary(agent),
    runtimeHeadline: agent.runtimeHeadline,
    mission: agent.mission,
    recentActivity: agent.recentActivity.map((item) => ({ ...item })),
    withdrawals: agent.withdrawals.map((item) => ({ ...item })),
  };
}

export function listAgentsForUser(userId: string) {
  return getOwnerStore(userId).map((agent) => toAgentSummary(agent));
}

export function getAgentForUser(userId: string, agentId: string) {
  const agent = findAgentRecord(userId, agentId);
  if (!agent) {
    return null;
  }

  return toAgentDetail(agent);
}

export function getPaperclipForUser(userId: string, agentId: string) {
  const agent = findAgentRecord(userId, agentId);
  if (!agent) {
    return null;
  }

  return {
    ...agent.paperclip,
    goals: agent.paperclip.goals.map((item) => ({ ...item })),
    activeTasks: agent.paperclip.activeTasks.map((item) => ({ ...item })),
    recentEvents: agent.paperclip.recentEvents.map((item) => ({ ...item })),
    roster: agent.paperclip.roster.map((item) => ({ ...item })),
  };
}

export function createWithdrawalForUser(
  userId: string,
  agentId: string,
  input: { amount: string; currency: string; destinationWalletAddress: string },
  idempotencyKey: string
) {
  const intentKey = `${userId || sharedOwner}:${agentId}:${idempotencyKey}`;
  const existingIntent = withdrawalIntents.get(intentKey);
  if (existingIntent) {
    return existingIntent;
  }

  const agent = findAgentRecord(userId, agentId);
  if (!agent) {
    return null;
  }

  const now = new Date().toISOString();
  const withdrawal: AgentWithdrawal = {
    id: `${agentId}-withdrawal-${agent.withdrawals.length + 1}`,
    agentId,
    amount: input.amount,
    currency: input.currency,
    destinationWalletAddress: input.destinationWalletAddress,
    status: 'requested',
    createdAt: now,
    updatedAt: now,
  };

  agent.withdrawals = [withdrawal, ...agent.withdrawals];
  agent.recentActivity = [
    {
      id: `${agentId}-activity-${Date.now()}`,
      title: 'Withdrawal requested',
      detail: `${input.amount} ${input.currency} is queued to return to the mobile wallet.`,
      at: now,
    },
    ...agent.recentActivity,
  ];
  agent.status = 'attention';
  agent.runtimeStatus = 'waiting';
  agent.runtimeHeadline = 'Waiting on operator approval for the next treasury move.';
  agent.lastActiveAt = now;
  withdrawalIntents.set(intentKey, withdrawal);

  return withdrawal;
}

export function getWithdrawalForUser(userId: string, agentId: string, withdrawalId: string) {
  const agent = findAgentRecord(userId, agentId);
  if (!agent) {
    return null;
  }

  return agent.withdrawals.find((withdrawal) => withdrawal.id === withdrawalId) || null;
}

export function seedReviewAgents() {
  if (!byOwner.has(reviewOwner)) {
    getOwnerStore(reviewOwner);
  }
}
