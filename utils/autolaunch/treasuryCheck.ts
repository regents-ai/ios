/**
 * The live treasury check a Base auction has to pass before the app offers
 * bidding, the same check the Autolaunch website runs at every bid press: the
 * verified treasury report matches the auction, its verification has not been
 * downgraded, the chain has not reorganised under it, and a fresh read of the
 * treasury Safe still shows three owners, a threshold of two, no modules, no
 * guard and the admitted fallback handler.
 *
 * The website runs that check in its own backend; nothing the app can reach
 * runs it today. Until a website endpoint answers for the live check, the app
 * does not offer bidding at all, and this function says so with the reason.
 * The auction's own `treasury_security` view is not that check: it is a
 * recorded report, not a fresh read of the Safe.
 */

import type { AutolaunchBaseAuction } from '@/types/autolaunch';

export type AutolaunchTreasuryCheck =
  | { ok: true }
  | { ok: false; reason: 'live_check_unavailable' };

export function checkAutolaunchTreasury(_auction: AutolaunchBaseAuction): AutolaunchTreasuryCheck {
  return { ok: false, reason: 'live_check_unavailable' };
}
