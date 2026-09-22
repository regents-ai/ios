import {
  createPublicClient,
  encodeFunctionData,
  erc20Abi,
  formatUnits,
  http,
  parseUnits,
  type Address,
  type Hex,
} from 'viem';
import { base } from 'viem/chains';

/**
 * REGENT staking on Base, read and prepared directly against the
 * RegentRevenueStaking contract. Addresses come from the verified deployment
 * manifest in regents/platform/contracts/base-mainnet.json.
 */
export const REGENT_STAKING_CHAIN_ID = 8453;
export const REGENT_STAKING_ADDRESS: Address = '0xb027Dc261636E30Cbc0fE25b2F8e1ed273354AB5';
export const REGENT_TOKEN_ADDRESS: Address = '0x6f89bcA4eA5931EdFCB09786267b251DeE752b07';
export const BASE_USDC_ADDRESS: Address = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

const REGENT_DECIMALS = 18;
const USDC_DECIMALS = 6;

export const regentRevenueStakingAbi = [
  {
    type: 'function',
    name: 'stake',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amount', type: 'uint256' },
      { name: 'receiver', type: 'address' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'unstake',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amount', type: 'uint256' },
      { name: 'recipient', type: 'address' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'claimUSDC',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'recipient', type: 'address' }],
    outputs: [{ name: 'amount', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'claimRegent',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'recipient', type: 'address' }],
    outputs: [{ name: 'amount', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'claimAndRestakeRegent',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [{ name: 'amount', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'paused',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'totalStaked',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'stakedBalance',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'previewClaimableUSDC',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'previewClaimableRegent',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'previewFundedClaimableRegent',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

export type RegentStakingAction = 'stake' | 'unstake' | 'claim_usdc' | 'claim_regent' | 'claim_and_restake_regent';

export type RegentStakingState = {
  chain_id: typeof REGENT_STAKING_CHAIN_ID;
  chain_label: 'Base';
  block_number: number;
  contract_address: Address;
  stake_token_address: Address;
  usdc_address: Address;
  paused: boolean;
  total_staked_raw: string;
  total_staked: string;
  wallet_address: Address;
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
  chain_id: typeof REGENT_STAKING_CHAIN_ID;
  to: Address;
  value: '0';
  data: Hex;
  expected_signer: Address;
  approval?: {
    token: Address;
    spender: Address;
    amount: string;
    data: Hex;
  };
};

/**
 * A failed read carries only the error's name: viem's messages quote the RPC
 * URL, which may hold a key, so they never reach a log or a response.
 */
export type RegentStakingReadResult =
  | { kind: 'ok'; staking: RegentStakingState }
  | { kind: 'missing_rpc'; requiredEnv: 'BASE_RPC_URL' }
  | { kind: 'rpc_error'; name: string };

export type RegentStakingReader = (walletAddress: Address) => Promise<RegentStakingReadResult>;

function baseRpcUrl() {
  return process.env.BASE_RPC_URL?.trim() || '';
}

/** A positive REGENT amount with at most 18 decimal places, in atomic units. */
export function parseRegentAmount(value: string): bigint | null {
  const trimmed = value.trim();
  if (!/^\d+(?:\.\d{1,18})?$/.test(trimmed)) {
    return null;
  }

  const atomic = parseUnits(trimmed, REGENT_DECIMALS);
  return atomic > 0n ? atomic : null;
}

/**
 * Calldata for one staking action, signed by and paid out to the same wallet.
 * The stake receiver, unstake recipient and claim recipient are always the
 * signer, exactly as regents.sh prepares them.
 */
export function prepareRegentStakingAction(
  input:
    | { action: 'stake' | 'unstake'; walletAddress: Address; amount: bigint }
    | { action: 'claim_usdc' | 'claim_regent' | 'claim_and_restake_regent'; walletAddress: Address },
): RegentStakingWalletAction {
  const signer = input.walletAddress;
  const action: RegentStakingWalletAction = {
    action: input.action,
    chain_id: REGENT_STAKING_CHAIN_ID,
    to: REGENT_STAKING_ADDRESS,
    value: '0',
    data: stakingCalldata(input),
    expected_signer: signer,
  };

  if (input.action === 'stake') {
    action.approval = {
      token: REGENT_TOKEN_ADDRESS,
      spender: REGENT_STAKING_ADDRESS,
      amount: input.amount.toString(),
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: 'approve',
        args: [REGENT_STAKING_ADDRESS, input.amount],
      }),
    };
  }

  return action;
}

function stakingCalldata(input: Parameters<typeof prepareRegentStakingAction>[0]): Hex {
  switch (input.action) {
    case 'stake':
      return encodeFunctionData({
        abi: regentRevenueStakingAbi,
        functionName: 'stake',
        args: [input.amount, input.walletAddress],
      });
    case 'unstake':
      return encodeFunctionData({
        abi: regentRevenueStakingAbi,
        functionName: 'unstake',
        args: [input.amount, input.walletAddress],
      });
    case 'claim_usdc':
      return encodeFunctionData({
        abi: regentRevenueStakingAbi,
        functionName: 'claimUSDC',
        args: [input.walletAddress],
      });
    case 'claim_regent':
      return encodeFunctionData({
        abi: regentRevenueStakingAbi,
        functionName: 'claimRegent',
        args: [input.walletAddress],
      });
    case 'claim_and_restake_regent':
      return encodeFunctionData({
        abi: regentRevenueStakingAbi,
        functionName: 'claimAndRestakeRegent',
      });
  }
}

/**
 * One wallet's staking picture, every figure read at the same Base block.
 */
export async function readRegentStaking(
  walletAddress: Address,
  rpcUrl = baseRpcUrl(),
): Promise<RegentStakingReadResult> {
  if (!rpcUrl) {
    return { kind: 'missing_rpc', requiredEnv: 'BASE_RPC_URL' };
  }

  try {
    const client = createPublicClient({ chain: base, transport: http(rpcUrl) });
    const blockNumber = await client.getBlockNumber();
    const [
      paused,
      totalStaked,
      stakedBalance,
      claimableUsdc,
      claimableRegent,
      fundedClaimableRegent,
      tokenBalance,
      stakeAllowance,
    ] = await client.multicall({
      allowFailure: false,
      blockNumber,
      contracts: [
        { address: REGENT_STAKING_ADDRESS, abi: regentRevenueStakingAbi, functionName: 'paused' },
        { address: REGENT_STAKING_ADDRESS, abi: regentRevenueStakingAbi, functionName: 'totalStaked' },
        { address: REGENT_STAKING_ADDRESS, abi: regentRevenueStakingAbi, functionName: 'stakedBalance', args: [walletAddress] },
        { address: REGENT_STAKING_ADDRESS, abi: regentRevenueStakingAbi, functionName: 'previewClaimableUSDC', args: [walletAddress] },
        { address: REGENT_STAKING_ADDRESS, abi: regentRevenueStakingAbi, functionName: 'previewClaimableRegent', args: [walletAddress] },
        { address: REGENT_STAKING_ADDRESS, abi: regentRevenueStakingAbi, functionName: 'previewFundedClaimableRegent', args: [walletAddress] },
        { address: REGENT_TOKEN_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: [walletAddress] },
        { address: REGENT_TOKEN_ADDRESS, abi: erc20Abi, functionName: 'allowance', args: [walletAddress, REGENT_STAKING_ADDRESS] },
      ],
    });

    return {
      kind: 'ok',
      staking: {
        chain_id: REGENT_STAKING_CHAIN_ID,
        chain_label: 'Base',
        block_number: Number(blockNumber),
        contract_address: REGENT_STAKING_ADDRESS,
        stake_token_address: REGENT_TOKEN_ADDRESS,
        usdc_address: BASE_USDC_ADDRESS,
        paused,
        total_staked_raw: totalStaked.toString(),
        total_staked: formatUnits(totalStaked, REGENT_DECIMALS),
        wallet_address: walletAddress,
        wallet_token_balance_raw: tokenBalance.toString(),
        wallet_token_balance: formatUnits(tokenBalance, REGENT_DECIMALS),
        wallet_stake_allowance_raw: stakeAllowance.toString(),
        wallet_stake_balance_raw: stakedBalance.toString(),
        wallet_stake_balance: formatUnits(stakedBalance, REGENT_DECIMALS),
        wallet_claimable_usdc_raw: claimableUsdc.toString(),
        wallet_claimable_usdc: formatUnits(claimableUsdc, USDC_DECIMALS),
        wallet_claimable_regent_raw: claimableRegent.toString(),
        wallet_claimable_regent: formatUnits(claimableRegent, REGENT_DECIMALS),
        wallet_funded_claimable_regent_raw: fundedClaimableRegent.toString(),
        wallet_funded_claimable_regent: formatUnits(fundedClaimableRegent, REGENT_DECIMALS),
      },
    };
  } catch (error) {
    return {
      kind: 'rpc_error',
      name: error instanceof Error ? error.name || 'Error' : typeof error,
    };
  }
}
