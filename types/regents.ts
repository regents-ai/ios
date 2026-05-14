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

export type RegentStakingAction =
  | 'stake'
  | 'unstake'
  | 'claim_usdc'
  | 'claim_regent'
  | 'claim_and_restake_regent';

export type RegentStakingState = {
  chain_id: number;
  chain_label: string;
  contract_address: string;
  owner_address: string;
  stake_token_address: string;
  usdc_address: string;
  treasury_recipient: string;
  revenue_share_supply_denominator_raw: string;
  revenue_share_supply_denominator: string;
  paused: boolean;
  total_staked_raw: string;
  total_staked: string;
  total_usdc_received_raw: string;
  total_usdc_received: string;
  direct_deposit_usdc_raw: string;
  direct_deposit_usdc: string;
  treasury_residual_usdc_raw: string;
  treasury_residual_usdc: string;
  materialized_outstanding_raw: string;
  materialized_outstanding: string;
  available_reward_inventory_raw: string;
  available_reward_inventory: string;
  total_claimed_so_far_raw: string;
  total_claimed_so_far: string;
  wallet_address: string | null;
  connected_wallet_address: string | null;
  wallet_stake_balance_raw: string | null;
  wallet_stake_balance: string | null;
  wallet_token_balance_raw: string | null;
  wallet_token_balance: string | null;
  wallet_claimable_usdc_raw: string | null;
  wallet_claimable_usdc: string | null;
  wallet_claimable_regent_raw: string | null;
  wallet_claimable_regent: string | null;
  wallet_funded_claimable_regent_raw: string | null;
  wallet_funded_claimable_regent: string | null;
};

export type RegentStakingActionState = {
  chain_id: number;
  chain_label: string;
  contract_address: string;
  wallet_address: string;
};

export type PlatformWalletAction = {
  action_id: string;
  owner_product: 'platform';
  resource: 'regent_staking';
  resource_id: string;
  action: RegentStakingAction;
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
  approval?: {
    token: string;
    spender: string;
    amount: string;
    data: string;
  };
};

export type RegentStakingActionResponse = {
  staking: RegentStakingActionState;
  wallet_action: PlatformWalletAction;
};

export type TerminalSessionStatus = 'idle' | 'running' | 'waiting' | 'failed';

export type PendingTerminalApproval = {
  requestId: string;
  action: string;
  regentName: string;
  riskCopy: string;
  amount?: string;
  currency?: string;
  contractAddress?: string;
  expiresAt: string;
  resolved: boolean;
};

export type TerminalSessionSummary = {
  id: string;
  title: string;
  agentId: string;
  agentName: string;
  status: TerminalSessionStatus;
  latestNote: string;
  lastUpdatedAt: string;
  pendingApproval?: PendingTerminalApproval;
};

export type TerminalSessionDetail = TerminalSessionSummary & {
  composerPlaceholder: string;
};

export type TerminalEvent = {
  eventId: string;
  type: string;
  sessionId: string;
  ts: string;
  chunk?: string;
  text?: string;
  role?: 'user' | 'assistant' | 'system';
  status?: TerminalSessionStatus;
  requestId?: string;
  action?: string;
  regentName?: string;
  riskCopy?: string;
  amount?: string;
  currency?: string;
  contractAddress?: string;
  result?: 'approved' | 'denied' | 'timed_out';
  message?: string;
};

export type PreparedWalletAction = {
  action_id: string;
  owner_product: 'ios';
  resource: 'mobile_wallet_action';
  resource_id: string;
  action: 'funding' | 'return';
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
