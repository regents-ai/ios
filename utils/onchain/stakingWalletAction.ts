import { PlatformWalletAction } from '../../types/regents';
import { createPublicClient, erc20Abi, http, isAddress } from 'viem';
import { base, baseSepolia } from 'viem/chains';

export type StakingNetwork = 'base' | 'base-sepolia';

export type StakingWalletCall = {
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
    throw new Error('Refresh staking and try again.');
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
    throw new Error('Refresh staking and try again.');
  }
}

export function stakingNetworkForChain(chainId: number): StakingNetwork {
  if (chainId === base.id) {
    return 'base';
  }

  if (chainId === baseSepolia.id) {
    return 'base-sepolia';
  }

  throw new Error('Switch to the network used by REGENT staking, then try again.');
}

export function hasPositiveRawAmount(value?: string | null) {
  try {
    return BigInt(value || '0') > 0n;
  } catch {
    return false;
  }
}

export function shouldRequestApprovalForAllowance(input: {
  allowance: bigint;
  requiredAmount: string;
}) {
  return input.allowance < normalizeValue(input.requiredAmount);
}

export function stakingActionCall(walletAction: PlatformWalletAction, expectedSigner: string): StakingWalletCall {
  const signer = normalizeAddress(expectedSigner, 'Your wallet');
  const actionSigner = normalizeAddress(walletAction.expected_signer, 'Your wallet');
  if (signer.toLowerCase() !== actionSigner.toLowerCase()) {
    throw new Error('Open staking with the wallet that will sign.');
  }

  stakingNetworkForChain(walletAction.chain_id);

  return {
    to: normalizeAddress(walletAction.to, 'Staking'),
    value: normalizeValue(walletAction.value),
    data: normalizeData(walletAction.data),
  };
}

export function stakingApprovalCall(walletAction: PlatformWalletAction, expectedSigner: string): StakingWalletCall | null {
  const approval = walletAction.approval;
  if (!approval) {
    return null;
  }

  stakingActionCall(walletAction, expectedSigner);

  return {
    to: normalizeAddress(approval.token, 'REGENT approval'),
    value: 0n,
    data: normalizeData(approval.data),
  };
}

export async function needsStakingApproval(walletAction: PlatformWalletAction, expectedSigner: string) {
  const approval = walletAction.approval;
  if (!approval) {
    return false;
  }

  const owner = normalizeAddress(expectedSigner, 'Your wallet');
  const token = normalizeAddress(approval.token, 'REGENT approval');
  const spender = normalizeAddress(approval.spender, 'Staking');
  const chain = walletAction.chain_id === baseSepolia.id ? baseSepolia : base;
  stakingNetworkForChain(chain.id);

  const client = createPublicClient({
    chain,
    transport: http(),
  });

  const allowance = await client.readContract({
    address: token,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [owner, spender],
  });

  return shouldRequestApprovalForAllowance({
    allowance,
    requiredAmount: approval.amount,
  });
}
