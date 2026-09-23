export type MobileAgentKind = 'muse' | 'grok_bot' | 'hermes' | 'other';

export type MobileAgent = {
  id: string;
  name: string;
  kind: MobileAgentKind;
  walletAddress: string;
  paired: boolean;
  createdAt: string;
  /** Base USDC balance as a decimal string, or null when it could not be read. */
  usdcBalance: string | null;
};

export type MobileAgentsList = {
  agents: MobileAgent[];
  /** False when Base USDC balances could not be read; every usdcBalance is then null. */
  balancesAvailable: boolean;
};

export type MobileAgentPairingCode = {
  code: string;
  expiresAt: string;
};

export type MobileAgentPairingStatus =
  | { status: 'waiting'; expiresAt: string }
  | { status: 'needs_confirmation'; walletAddress: string; expiresAt: string }
  | { status: 'expired' };

/** One wallet's Base holdings and REGENT staking position, as decimal token amounts. */
export type BaseWalletHoldings = {
  wallet_address: string;
  eth_balance: string;
  usdc_balance: string;
  regent_balance: string;
  staked_regent: string;
  claimable_usdc: string;
  claimable_regent: string;
};

export type BasePortfolio = {
  chain_id: 8453;
  block_number: number;
  wallets: BaseWalletHoldings[];
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

export type PaymentRequestStatus = 'waiting' | 'paid' | 'declined';

/** A paired agent asking its person for Base USDC. */
export type PaymentRequest = {
  id: string;
  agentId: string;
  agentName: string;
  agentWallet: string;
  /** The Base address that receives the USDC. */
  to: string;
  /** USDC as a decimal with at least two decimal places, for example "5.00". */
  amount: string;
  amountRaw: string;
  /** What the money is for, in the agent's own words. */
  note: string;
  createdAt: string;
  status: PaymentRequestStatus;
  /** The Base transaction of the latest confirmed payment. */
  txHash: string | null;
};

export type PaymentRequestsList = {
  requests: PaymentRequest[];
};

/** The single Base USDC transfer that pays a request, for the wallet named as expected_signer. */
export type PaymentRequestWalletAction = {
  action: 'pay';
  chain_id: number;
  request_id: string;
  to: string;
  value: string;
  data: string;
  expected_signer: string;
  recipient: string;
  amount_raw: string;
};
