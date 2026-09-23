/**
 * The app backend's Autolaunch bidding routes, declared under
 * /mobile/autolaunch/auctions/{auction_id} in api-contract.openapiv3.yaml.
 *
 * Kept apart from utils/regentApi/client.ts: these three calls belong to the
 * auction screen alone and share nothing with the Regent routes.
 */

import { getBaseUrl } from '@/constants/BASE_URL';
import type {
  AutolaunchAuctionPosition,
  AutolaunchBidWalletAction,
  AutolaunchSettlementWalletAction,
} from '@/types/autolaunch';
import { ApiError, apiFailureKindForStatus, privacySafeLogCategory } from '@/utils/apiError';
import { authenticatedFetch } from '@/utils/authenticatedFetch';

type AutolaunchBidPath =
  | `/mobile/autolaunch/auctions/${string}/position?walletAddress=${string}`
  | `/mobile/autolaunch/auctions/${string}/bid`
  | `/mobile/autolaunch/auctions/${string}/settle`;

async function requestJson<T>(path: AutolaunchBidPath, init?: RequestInit): Promise<T> {
  const response = await authenticatedFetch(`${getBaseUrl()}${path}`, init);

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message =
      typeof payload?.error?.message === 'string'
        ? payload.error.message
        : 'This auction is unavailable right now.';
    const failure = new ApiError(apiFailureKindForStatus(response.status), message, response.status);
    console.warn('[api]', privacySafeLogCategory(failure));
    throw failure;
  }

  return response.json() as Promise<T>;
}

function postJson(body: Record<string, string>): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

const auctionPath = (auctionId: string) => `/mobile/autolaunch/auctions/${encodeURIComponent(auctionId)}` as const;

/** Where the auction stands and every bid this wallet placed on it, at one Base block. */
export async function getAutolaunchPosition(input: {
  auctionId: string;
  walletAddress: string;
}): Promise<AutolaunchAuctionPosition> {
  const body = await requestJson<{ position: AutolaunchAuctionPosition }>(
    `${auctionPath(input.auctionId)}/position?walletAddress=${encodeURIComponent(input.walletAddress)}`
  );
  return body.position;
}

/** The calls one bid needs, reviewed against the auction as it stands. */
export async function prepareAutolaunchBid(input: {
  auctionId: string;
  walletAddress: string;
  amount: string;
  maxPrice: string;
}): Promise<AutolaunchBidWalletAction> {
  const body = await requestJson<{ wallet_action: AutolaunchBidWalletAction }>(
    `${auctionPath(input.auctionId)}/bid`,
    postJson({ walletAddress: input.walletAddress, amount: input.amount, maxPrice: input.maxPrice })
  );
  return body.wallet_action;
}

/** The return and token collection the auction accepts for one bid right now. */
export async function prepareAutolaunchSettlement(input: {
  auctionId: string;
  walletAddress: string;
  bidId: string;
}): Promise<AutolaunchSettlementWalletAction> {
  const body = await requestJson<{ wallet_action: AutolaunchSettlementWalletAction }>(
    `${auctionPath(input.auctionId)}/settle`,
    postJson({ walletAddress: input.walletAddress, bidId: input.bidId })
  );
  return body.wallet_action;
}
