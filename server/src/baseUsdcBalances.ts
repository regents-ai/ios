import { createPublicClient, erc20Abi, formatUnits, http, type Address } from 'viem';
import { base } from 'viem/chains';

import { BASE_USDC_ADDRESS } from './regentStaking.js';

const USDC_DECIMALS = 6;

/**
 * A failed read carries only the error's name: viem's messages quote the RPC
 * URL, which may hold a key, so they never reach a log or a response.
 */
export type BaseUsdcBalancesResult =
  | { kind: 'ok'; balances: Record<string, string> }
  | { kind: 'missing_rpc'; requiredEnv: 'BASE_RPC_URL' }
  | { kind: 'rpc_error'; name: string };

export type BaseUsdcBalancesReader = (addresses: Address[]) => Promise<BaseUsdcBalancesResult>;

function baseRpcUrl() {
  return process.env.BASE_RPC_URL?.trim() || '';
}

/**
 * Base USDC balances for a set of wallets, read in one multicall and keyed by
 * lowercase address as decimal USDC strings.
 */
export async function readBaseUsdcBalances(
  addresses: Address[],
  rpcUrl = baseRpcUrl(),
): Promise<BaseUsdcBalancesResult> {
  if (addresses.length === 0) {
    return { kind: 'ok', balances: {} };
  }
  if (!rpcUrl) {
    return { kind: 'missing_rpc', requiredEnv: 'BASE_RPC_URL' };
  }

  try {
    const client = createPublicClient({ chain: base, transport: http(rpcUrl) });
    const raw = await client.multicall({
      allowFailure: false,
      contracts: addresses.map((address) => ({
        address: BASE_USDC_ADDRESS,
        abi: erc20Abi,
        functionName: 'balanceOf' as const,
        args: [address] as const,
      })),
    });

    const balances: Record<string, string> = {};
    addresses.forEach((address, index) => {
      balances[address.toLowerCase()] = formatUnits(raw[index] ?? 0n, USDC_DECIMALS);
    });
    return { kind: 'ok', balances };
  } catch (error) {
    return {
      kind: 'rpc_error',
      name: error instanceof Error ? error.name || 'Error' : typeof error,
    };
  }
}
