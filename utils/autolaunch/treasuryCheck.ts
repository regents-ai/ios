/**
 * The live treasury check a Base auction has to pass before the app offers
 * bidding, the same check the Autolaunch website runs at every bid press: the
 * verified treasury report matches the auction, its verification has not been
 * downgraded, the chain has not reorganised under it, and a fresh read of the
 * treasury Safe still shows three owners, a threshold of two, no modules, no
 * guard and the admitted fallback handler.
 *
 * The website runs that check and answers it at
 * GET /api/v1/auctions/:id/treasury-check. Only a successful JSON answer with
 * `ok: true` passes. A JSON answer with a `reason` fails with that reason;
 * anything else (no answer, an error status, a reply that is not JSON)
 * fails as `check_unavailable`. Every call asks the website again: a pass is
 * never kept for a later press.
 */

import { getAutolaunchTreasuryCheck } from '@/utils/autolaunch/client';

export type AutolaunchTreasuryCheck = { ok: true } | { ok: false; reason: string };

export async function checkAutolaunchTreasury(auctionId: string): Promise<AutolaunchTreasuryCheck> {
  try {
    const answer = await getAutolaunchTreasuryCheck(auctionId);
    if (answer?.ok === true) {
      return { ok: true };
    }
    return { ok: false, reason: typeof answer?.reason === 'string' ? answer.reason : 'check_unavailable' };
  } catch {
    return { ok: false, reason: 'check_unavailable' };
  }
}
