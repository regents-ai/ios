import { createPublicClient, erc20Abi, formatUnits, http, multicall3Abi, type Address } from 'viem';
import { base } from 'viem/chains';

import {
  BASE_USDC_ADDRESS,
  REGENT_STAKING_ADDRESS,
  REGENT_STAKING_CHAIN_ID,
  REGENT_TOKEN_ADDRESS,
  regentRevenueStakingAbi,
} from './regentStaking.js';

export const MAX_PORTFOLIO_WALLETS = 5;

const ETH_DECIMALS = 18;
const REGENT_DECIMALS = 18;
const USDC_DECIMALS = 6;
const MULTICALL3_ADDRESS = base.contracts.multicall3.address;

/** What one wallet holds on Base, as decimal strings. */
export type BaseWalletHoldings = {
  wallet_address: Address;
  eth_balance: string;
  usdc_balance: string;
  regent_balance: string;
  staked_regent: string;
  claimable_usdc: string;
  claimable_regent: string;
};

export type BasePortfolio = {
  chain_id: typeof REGENT_STAKING_CHAIN_ID;
  block_number: number;
  wallets: BaseWalletHoldings[];
};

/**
 * A failed read carries only the error's name: viem's messages quote the RPC
 * URL, which may hold a key, so they never reach a log or a response.
 */
export type BasePortfolioReadResult =
  | { kind: 'ok'; portfolio: BasePortfolio }
  | { kind: 'missing_rpc'; requiredEnv: 'BASE_RPC_URL' }
  | { kind: 'rpc_error'; name: string };

export type BasePortfolioReader = (wallets: Address[]) => Promise<BasePortfolioReadResult>;

function baseRpcUrl() {
  return process.env.BASE_RPC_URL?.trim() || '';
}

function walletCalls(wallet: Address) {
  return [
    { address: MULTICALL3_ADDRESS, abi: multicall3Abi, functionName: 'getEthBalance', args: [wallet] },
    { address: BASE_USDC_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: [wallet] },
    { address: REGENT_TOKEN_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: [wallet] },
    { address: REGENT_STAKING_ADDRESS, abi: regentRevenueStakingAbi, functionName: 'stakedBalance', args: [wallet] },
    { address: REGENT_STAKING_ADDRESS, abi: regentRevenueStakingAbi, functionName: 'previewClaimableUSDC', args: [wallet] },
    { address: REGENT_STAKING_ADDRESS, abi: regentRevenueStakingAbi, functionName: 'previewClaimableRegent', args: [wallet] },
  ] as const;
}

const CALLS_PER_WALLET = walletCalls(REGENT_TOKEN_ADDRESS).length;

/**
 * ETH, USDC and REGENT balances plus the REGENT staking position for each
 * wallet, all read in one multicall at the same Base block. Claimable REGENT
 * is the figure the Earn tab shows, from the same staking contract.
 */
export async function readBasePortfolio(
  wallets: Address[],
  rpcUrl = baseRpcUrl(),
): Promise<BasePortfolioReadResult> {
  if (!rpcUrl) {
    return { kind: 'missing_rpc', requiredEnv: 'BASE_RPC_URL' };
  }

  try {
    const client = createPublicClient({ chain: base, transport: http(rpcUrl) });
    const blockNumber = await client.getBlockNumber();
    // batchSize 0 keeps every figure in a single eth_call.
    const results = await client.multicall({
      allowFailure: false,
      batchSize: 0,
      blockNumber,
      contracts: wallets.flatMap(walletCalls),
    });

    return {
      kind: 'ok',
      portfolio: {
        chain_id: REGENT_STAKING_CHAIN_ID,
        block_number: Number(blockNumber),
        wallets: wallets.map((wallet, index) => {
          const [eth, usdc, regent, staked, claimableUsdc, claimableRegent] = results.slice(
            index * CALLS_PER_WALLET,
            (index + 1) * CALLS_PER_WALLET,
          ) as bigint[];
          return {
            wallet_address: wallet,
            eth_balance: formatUnits(eth!, ETH_DECIMALS),
            usdc_balance: formatUnits(usdc!, USDC_DECIMALS),
            regent_balance: formatUnits(regent!, REGENT_DECIMALS),
            staked_regent: formatUnits(staked!, REGENT_DECIMALS),
            claimable_usdc: formatUnits(claimableUsdc!, USDC_DECIMALS),
            claimable_regent: formatUnits(claimableRegent!, REGENT_DECIMALS),
          };
        }),
      },
    };
  } catch (error) {
    return {
      kind: 'rpc_error',
      name: error instanceof Error ? error.name || 'Error' : typeof error,
    };
  }
}
