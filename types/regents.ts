export type RegentStatus = 'active' | 'attention' | 'paused';
// 'unknown' is the tolerant-decode case: any unrecognized wire value maps to
// it instead of crashing an exhaustive switch (see utils/regentApi/tolerantDecode).
export type RegentRuntimeStatus = 'online' | 'waiting' | 'offline' | 'unknown';
// Where the agent runs: a hosted cloud sprite, or a self-run Hermes on the
// owner's own computer. Voice on a self-run agent uses the paired local
// gateway; a hosted agent uses the hosted voice path.
export type RegentRuntimeKind = 'hosted' | 'self_hosted';
export type RegentReturnStatus = 'requested' | 'approved' | 'broadcasting' | 'confirmed' | 'failed' | 'unknown';

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

export type HermesVoiceHealth = 'ok' | 'degraded' | 'unavailable';

export type HermesVoiceAccount = {
  required: true;
  satisfied: boolean;
  provider: 'openai_chatgpt';
  connect_url?: string | null;
};

export type MobileRegentVoice = {
  enabled: boolean;
  health: HermesVoiceHealth;
  account: HermesVoiceAccount;
};

export type RegentSummary = {
  id: string;
  name: string;
  status: RegentStatus;
  runtimeStatus: RegentRuntimeStatus;
  runtimeKind: RegentRuntimeKind;
  walletAddress: string;
  platformState: RegentPlatformState;
  voice: MobileRegentVoice;
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
  block_number: number;
  contract_address: string;
  stake_token_address: string;
  usdc_address: string;
  paused: boolean;
  total_staked_raw: string;
  total_staked: string;
  wallet_address: string;
  wallet_token_balance_raw: string;
  wallet_token_balance: string;
  wallet_stake_allowance_raw: string;
  wallet_stake_balance_raw: string;
  wallet_stake_balance: string;
  wallet_claimable_usdc_raw: string;
  wallet_claimable_usdc: string;
  wallet_claimable_regent_raw: string;
  wallet_claimable_regent: string;
  wallet_funded_claimable_regent_raw: string;
  wallet_funded_claimable_regent: string;
};

export type RegentStakingWalletAction = {
  action: RegentStakingAction;
  chain_id: number;
  to: string;
  value: string;
  data: string;
  expected_signer: string;
  approval?: {
    token: string;
    spender: string;
    amount: string;
    data: string;
  };
};

export type RegentStakingActionResponse = {
  wallet_action: RegentStakingWalletAction;
};

// 'unknown' is the tolerant-decode case for unrecognized wire values.
export type MessageThreadStatus = 'idle' | 'running' | 'waiting' | 'failed' | 'unknown';

export type PendingMessageApproval = {
  requestId: string;
  action: string;
  regentName: string;
  riskCopy: string;
  amount?: string;
  currency?: string;
  amountUsd?: string;
  contractAddress?: string;
  expiresAt?: string;
  resolved: boolean;
};

export type MessageThread = {
  id: string;
  platformThreadId: string;
  title: string;
  agentId: string;
  agentName: string;
  source: 'platform_rwr';
  status: MessageThreadStatus;
  latestNote: string;
  lastUpdatedAt: string;
  pendingApproval?: PendingMessageApproval;
};

export type MessageThreadDetail = MessageThread & {
  composerPlaceholder: string;
};

export type MessageThreadEvent = {
  eventId: string;
  type: string;
  threadId: string;
  ts: string;
  chunk?: string;
  text?: string;
  role?: 'user' | 'assistant' | 'system';
  status?: MessageThreadStatus;
  requestId?: string;
  action?: string;
  regentName?: string;
  riskCopy?: string;
  amount?: string;
  currency?: string;
  amountUsd?: string;
  contractAddress?: string;
  result?: 'approved' | 'denied' | 'timed_out';
  message?: string;
};

export type HermesVoiceTool = {
  name: string;
  owner: 'hermes' | 'ios';
  description: string;
  requires_approval?: boolean;
};

export type CreateHermesVoiceSessionRequest = {
  voice?: string;
  locale?: string;
  timezone?: string;
  reasoning_effort?: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
  device_capabilities: string[];
  preferred_transport?: 'webrtc';
};

export type HermesVoiceSession = {
  session_id: string;
  agent_id: string;
  expires_at: string;
  account: HermesVoiceAccount;
  realtime: {
    provider: 'openai-realtime';
    model: string;
    client_secret: string;
    client_secret_expires_at: string;
    calls_url?: string;
  };
  tools: HermesVoiceTool[];
};

export type HermesVoiceStatus = {
  enabled: boolean;
  health: HermesVoiceHealth;
  agent_id: string;
  account: HermesVoiceAccount;
  active_session_id?: string | null;
  active_turn_id?: string | null;
  queue_depth?: number;
  last_event_id?: string | null;
};

export type HermesVoiceToolResult = {
  session_id: string;
  tool_call_id: string;
  ok: boolean;
  result?: unknown;
  error?: Record<string, unknown> | null;
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
