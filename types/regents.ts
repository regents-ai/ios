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

export type MobileAgentPairingCode = {
  code: string;
  expiresAt: string;
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
