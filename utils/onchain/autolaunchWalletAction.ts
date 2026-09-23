/**
 * Turns a prepared Autolaunch wallet action into the calls the app's smart
 * account sends in one signature. The action names the wallet it was
 * prepared for; a different signer is refused before anything is sent.
 */

import type { AutolaunchBidWalletAction, AutolaunchSettlementWalletAction } from '../../types/autolaunch';
import { isAddress } from 'viem';
import { base } from 'viem/chains';

export type AutolaunchWalletNetwork = 'base';

export type AutolaunchCall = {
  to: `0x${string}`;
  value: bigint;
  data: `0x${string}`;
};

function normalizeAddress(value: string, label: string): `0x${string}` {
  const trimmed = value.trim();
  if (!isAddress(trimmed)) {
    throw new Error(`${label} is not ready.`);
  }

  return trimmed as `0x${string}`;
}

function normalizeData(value: string): `0x${string}` {
  const trimmed = value.trim();
  if (!/^0x([a-fA-F0-9]{2})*$/.test(trimmed)) {
    throw new Error('Refresh the auction and try again.');
  }

  return trimmed as `0x${string}`;
}

function normalizeValue(value: string) {
  try {
    const parsed = BigInt(value);
    if (parsed < 0n) {
      throw new Error('negative');
    }

    return parsed;
  } catch {
    throw new Error('Refresh the auction and try again.');
  }
}

export function autolaunchNetworkForChain(chainId: number): AutolaunchWalletNetwork {
  if (chainId === base.id) {
    return 'base';
  }

  throw new Error('This auction is not on Base.');
}

/** Every call of the action, in order, for the wallet it was prepared for. */
export function autolaunchWalletCalls(
  walletAction: AutolaunchBidWalletAction | AutolaunchSettlementWalletAction,
  expectedSigner: string
): AutolaunchCall[] {
  const signer = normalizeAddress(expectedSigner, 'Your wallet');
  const actionSigner = normalizeAddress(walletAction.expected_signer, 'Your wallet');
  if (signer.toLowerCase() !== actionSigner.toLowerCase()) {
    throw new Error('Open this auction with the wallet that will sign.');
  }

  autolaunchNetworkForChain(walletAction.chain_id);
  if (walletAction.calls.length === 0) {
    throw new Error('Refresh the auction and try again.');
  }

  return walletAction.calls.map((call) => ({
    to: normalizeAddress(call.to, 'The auction'),
    value: normalizeValue(call.value),
    data: normalizeData(call.data),
  }));
}
