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

export type PreviewPaperclipGoal = {
  id: string;
  title: string;
  status: string;
  note?: string;
};

export type PreviewPaperclipTask = {
  id: string;
  title: string;
  status: string;
  owner?: string;
  note?: string;
};

export type PreviewPaperclipEvent = {
  id: string;
  title: string;
  detail: string;
  at: string;
};

export type PreviewPaperclipRosterMember = {
  id: string;
  name: string;
  role: string;
  status: string;
};

export type PreviewPaperclipDetail = {
  agentId: string;
  headline: string;
  companySummary: string;
  dashboardUrl: string;
  goals: PreviewPaperclipGoal[];
  activeTasks: PreviewPaperclipTask[];
  recentEvents: PreviewPaperclipEvent[];
  roster: PreviewPaperclipRosterMember[];
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
