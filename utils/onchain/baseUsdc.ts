/**
 * USDC on Base: the one currency the phone wallet pays agent requests and
 * Autolaunch bids in, and what the "Add USDC to pay this" offer buys.
 */

import { parseUnits } from 'viem';

import { MIN_PURCHASE_USD } from '../onramp/purchaseLimits';

export const BASE_CHAIN_ID = 8453;
export const BASE_USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

const USDC_DECIMALS = 6;
/** Micro-USDC in one cent. */
const CENT = 10_000n;
const DECIMAL_AMOUNT = /^\d+(\.\d{1,6})?$/;

export function isBaseUsdc(chainId: number, tokenAddress: string | null): boolean {
  return chainId === BASE_CHAIN_ID && tokenAddress?.toLowerCase() === BASE_USDC_ADDRESS.toLowerCase();
}

/**
 * How much USDC to buy so a wallet holding `held` can pay `needed`: the
 * shortfall rounded up to the cent, and never below the smallest purchase
 * Coinbase takes. Null when the wallet already holds enough, or when either
 * amount is not a plain USDC amount.
 */
export function usdcTopUp(needed: string, held: string): string | null {
  if (!DECIMAL_AMOUNT.test(needed) || !DECIMAL_AMOUNT.test(held)) {
    return null;
  }

  const shortfall = parseUnits(needed, USDC_DECIMALS) - parseUnits(held, USDC_DECIMALS);
  if (shortfall <= 0n) {
    return null;
  }

  const cents = (shortfall + CENT - 1n) / CENT;
  const minimum = BigInt(MIN_PURCHASE_USD * 100);
  const total = cents > minimum ? cents : minimum;
  return `${total / 100n}.${(total % 100n).toString().padStart(2, '0')}`;
}
