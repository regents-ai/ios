/**
 * What the Home tab says about each product, as pure functions so the node
 * test lane can load them directly.
 */

import type { User as PrivyUser } from '@privy-io/api-types';
import { formatUnits, parseUnits } from 'viem';

import type { AutolaunchAuction } from '../../types/autolaunch';
import type { MobileAgent } from '../../types/regents';

const USDC_DECIMALS = 6;

/**
 * The wallet that holds the person's Regents Balance: the Ethereum wallet they
 * sign in to the Regents websites with. The websites treat the most recently
 * verified linked wallet as the signed-in one, so this picks the linked
 * Ethereum wallet, other than the phone wallet, with the latest
 * `latest_verified_at`. A wallet that was never verified is never the
 * signed-in one. Null when no such wallet is linked.
 */
export function regentsBalanceWallet(
  linkedAccounts: PrivyUser['linked_accounts'],
  phoneWallet: string | null,
): string | null {
  const phoneKey = phoneWallet?.toLowerCase();
  let chosen: { address: string; verifiedAt: number } | null = null;

  for (const account of linkedAccounts) {
    if (
      account.type !== 'wallet' ||
      account.chain_type !== 'ethereum' ||
      account.latest_verified_at === null ||
      account.address.toLowerCase() === phoneKey
    ) {
      continue;
    }
    if (!chosen || account.latest_verified_at > chosen.verifiedAt) {
      chosen = { address: account.address, verifiedAt: account.latest_verified_at };
    }
  }

  return chosen?.address ?? null;
}

/** The exact USDC total across the agents whose balance could be read. */
export function agentsUsdcTotal(agents: MobileAgent[]): string {
  const total = agents.reduce(
    (sum, agent) => (agent.usdcBalance === null ? sum : sum + parseUnits(agent.usdcBalance, USDC_DECIMALS)),
    0n,
  );
  return formatUnits(total, USDC_DECIMALS);
}

/** How many auctions are taking bids right now. */
export function openAuctionCount(auctions: AutolaunchAuction[]): number {
  return auctions.filter((auction) => auction.state === 'active').length;
}

export function openAuctionsCopy(count: number): string {
  if (count === 0) {
    return 'No auctions are open right now.';
  }
  return count === 1 ? '1 auction is open now.' : `${count} auctions are open now.`;
}

export function agentCountCopy(count: number): string {
  return count === 1 ? '1 agent' : `${count} agents`;
}
