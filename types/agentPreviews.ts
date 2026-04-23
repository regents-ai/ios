export type PreviewAgentStatus = 'active' | 'attention' | 'paused';
export type PreviewRuntimeStatus = 'online' | 'waiting' | 'offline';
export type PreviewWithdrawalStatus = 'requested' | 'approved' | 'broadcasting' | 'confirmed' | 'failed';

export type PreviewAgentSummary = {
  id: string;
  name: string;
  status: PreviewAgentStatus;
  runtimeStatus: PreviewRuntimeStatus;
  walletAddress: string;
  stablecoinSymbol: string;
  stablecoinBalance: string;
  stablecoinBalanceUsd: string;
  lastActiveAt: string;
  treasuryNote?: string;
};

export type PreviewAgentActivity = {
  id: string;
  title: string;
  detail: string;
  at: string;
};

export type PreviewAgentWithdrawal = {
  id: string;
  agentId: string;
  amount: string;
  currency: string;
  destinationWalletAddress: string;
  status: PreviewWithdrawalStatus;
  createdAt: string;
  updatedAt: string;
};

export type PreviewAgentDetail = PreviewAgentSummary & {
  runtimeHeadline: string;
  mission: string;
  recentActivity: PreviewAgentActivity[];
  withdrawals: PreviewAgentWithdrawal[];
};

export type PreviewRegentManagerGoal = {
  id: string;
  title: string;
  status: string;
  note?: string;
};

export type PreviewRegentManagerTask = {
  id: string;
  title: string;
  status: string;
  owner?: string;
  note?: string;
};

export type PreviewRegentManagerEvent = {
  id: string;
  title: string;
  detail: string;
  at: string;
};

export type PreviewRegentManagerRosterMember = {
  id: string;
  name: string;
  role: string;
  status: string;
};

export type PreviewRegentManagerDetail = {
  agentId: string;
  headline: string;
  companySummary: string;
  dashboardUrl: string;
  goals: PreviewRegentManagerGoal[];
  activeTasks: PreviewRegentManagerTask[];
  recentEvents: PreviewRegentManagerEvent[];
  roster: PreviewRegentManagerRosterMember[];
};

export type PreviewWalletFundingChoice = {
  network: string;
  token: {
    symbol?: string;
    name?: string;
    contractAddress?: string;
    mintAddress?: string;
  };
  amount?: {
    amount?: string;
    decimals?: string;
  };
  usdValue?: number;
};
