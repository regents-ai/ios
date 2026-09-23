/**
 * What the Home tab says about each product, as pure functions so the node
 * test lane can load them directly.
 */

import type { User as PrivyUser } from '@privy-io/api-types';
import { formatUnits, parseUnits } from 'viem';

import type { AutolaunchAuction } from '../../types/autolaunch';
import type { MobileAgent } from '../../types/regents';

/** The most wallets one portfolio read covers. */
export const MAX_PORTFOLIO_WALLETS = 5;

const USDC_DECIMALS = 6;

/**
 * The Ethereum wallets linked to the person's Regents account (the same
 * account regents.sh signs in with), other than the phone wallet, in the
 * order they were linked and without repeats.
 */
export function websiteWalletAddresses(
  linkedAccounts: PrivyUser['linked_accounts'],
  phoneWallet: string | null,
): string[] {
  const seen = new Set(phoneWallet ? [phoneWallet.toLowerCase()] : []);
  const wallets: string[] = [];

  for (const account of linkedAccounts) {
    if (account.type !== 'wallet' || account.chain_type !== 'ethereum') {
      continue;
    }
    const key = account.address.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      wallets.push(account.address);
    }
  }

  return wallets;
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
