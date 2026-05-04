export type RegentStatus = 'active' | 'attention' | 'paused';
export type RegentRuntimeStatus = 'online' | 'waiting' | 'offline';
export type RegentReturnStatus = 'requested' | 'approved' | 'broadcasting' | 'confirmed' | 'failed';

export type PlatformFormationStatus = 'pending' | 'blocked' | 'provisioning' | 'ready';
export type PlatformBillingStatus = 'trial' | 'free-day' | 'prepaid' | 'paused' | 'zero' | 'failed';
export type PlatformRuntimeStatus = 'provisioning' | 'ready' | 'paused' | 'blocked';

export type RegentPlatformState = {
  claimedName: string;
  slug: string;
  formationStatus: PlatformFormationStatus;
  billingStatus: PlatformBillingStatus;
  runtimeStatus: PlatformRuntimeStatus;
  blockers: string[];
  dashboardUrl: string;
  prepaidBalanceUsd?: string;
  freeDayEndsAt?: string;
  nextPauseAt?: string;
};

export type RegentSummary = {
  id: string;
  name: string;
  status: RegentStatus;
  runtimeStatus: RegentRuntimeStatus;
  walletAddress: string;
  platformState: RegentPlatformState;
  lastActiveAt: string;
  treasuryNote?: string;
};

export type RegentActivity = {
  id: string;
  title: string;
  detail: string;
  at: string;
};

export type RegentReturnRequest = {
  id: string;
  regentId: string;
  amount: string;
  currency: string;
  destinationWalletAddress: string;
  chainId: number;
  expectedSigner: string;
  to: string;
  value: string;
  data: string;
  status: RegentReturnStatus;
  createdAt: string;
  updatedAt: string;
  txHash?: string;
  blockNumber?: number;
};

export type RegentFundingIntent = {
  id: string;
  regentId: string;
  amount: string;
  currency: string;
  sourceWalletAddress: string;
  destinationWalletAddress: string;
  chainId: number;
  tokenAddress: string;
  expectedSigner: string;
  to: string;
  value: string;
  data: string;
  status: 'created' | 'signed' | 'confirmed' | 'failed';
  createdAt: string;
  updatedAt: string;
  txHash?: string;
  blockNumber?: number;
};

export type BaseRegentSnapshot = {
  regentId: string;
  chainId: number;
  blockNumber: number;
  contractAddress: string;
  stale: boolean;
  claimableUsdc: string;
  stakedRegent: string;
  revenueLaneUsdc: string;
  treasuryResidualUsdc: string;
  subjectStatus: string;
};

export type PreparedWalletAction = {
  action_id: string;
  owner_product: 'ios';
  resource: 'mobile_wallet_action';
  resource_id: string;
  action: 'stake' | 'claim' | 'funding' | 'return';
  chain_id: number;
  to: string;
  value: string;
  data: string;
  expected_signer: string;
  expires_at: string;
  idempotency_key: string;
  simulation: {
    required: boolean;
    status: 'not_required' | 'pending' | 'passed' | 'failed';
    block_number: number | null;
  };
  risk_copy: string;
  status: 'prepared' | 'confirmed' | 'expired' | 'failed';
  tx_hash?: string;
  block_number?: number;
};

export type RegentDetail = RegentSummary & {
  runtimeHeadline: string;
  mission: string;
  recentActivity: RegentActivity[];
  returnRequests: RegentReturnRequest[];
};

export type RegentManagerGoal = {
  id: string;
  title: string;
  status: string;
  note?: string;
};

export type RegentManagerTask = {
  id: string;
  title: string;
  status: string;
  owner?: string;
  note?: string;
};

export type RegentManagerEvent = {
  id: string;
  title: string;
  detail: string;
  at: string;
};

export type RegentManagerRosterMember = {
  id: string;
  name: string;
  role: string;
  status: string;
};

export type RegentManagerDetail = {
  regentId: string;
  headline: string;
  companySummary: string;
  dashboardUrl: string;
  goals: RegentManagerGoal[];
  activeTasks: RegentManagerTask[];
  recentEvents: RegentManagerEvent[];
  roster: RegentManagerRosterMember[];
};
