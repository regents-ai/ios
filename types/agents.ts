export type AgentStatus = 'active' | 'attention' | 'paused';
export type RuntimeStatus = 'online' | 'waiting' | 'offline';
export type WithdrawalStatus = 'requested' | 'approved' | 'broadcasting' | 'confirmed' | 'failed';

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

export type WalletFundingChoice = {
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
