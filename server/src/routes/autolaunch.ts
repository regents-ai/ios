import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { Address } from 'viem';

import { sendError } from '../httpResponses.js';
import {
  prepareAutolaunchBid,
  prepareAutolaunchSettlement,
  readAutolaunchPosition,
  type AutolaunchBidPreparer,
  type AutolaunchPositionReader,
  type AutolaunchReadResult,
  type AutolaunchRefusal,
  type AutolaunchSettlementPreparer,
} from '../autolaunchBids.js';

/**
 * Bidding on Autolaunch auctions on Base from the app's own wallet. The
 * signed-in user names the wallet that signs; every prepared call is bound to
 * that wallet the way the staking routes bind theirs.
 */
const evmAddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/)
  .transform((value) => value as Address);
const decimalSchema = z.string().regex(/^\d+(?:\.\d+)?$/);

const paramsSchema = z.object({ auction_address: evmAddressSchema });
const positionQuerySchema = z.object({ walletAddress: evmAddressSchema });
const bidBodySchema = z.object({
  walletAddress: evmAddressSchema,
  amount: decimalSchema,
  maxPrice: decimalSchema.optional(),
});
const settlementBodySchema = z.object({
  walletAddress: evmAddressSchema,
  bidId: z.string().regex(/^\d+$/),
});

// What the wallet is told when the auction, not the app, says no.
const refusalCopy: Record<AutolaunchRefusal, string> = {
  auction_not_biddable: 'This auction is not taking bids right now.',
  invalid_amount: 'Enter an amount the auction accepts.',
  invalid_price: 'Enter a maximum price the auction accepts.',
  price_below_admissible_tick: 'That maximum price is below the current price. Raise it or leave it blank.',
  amount_above_balance: 'Your wallet does not hold that much.',
  bid_preparation_unavailable: 'The bid could not be prepared against the auction right now.',
  bid_not_found: 'That bid does not exist on this auction.',
  not_your_bid: 'That bid belongs to another wallet.',
  auction_not_ended: 'The auction has not ended yet.',
  auction_not_started: 'The auction has not started yet.',
  already_returned: 'This bid has already been returned.',
  bid_needs_partial_exit: 'This bid needs a partial return that is not available yet.',
  claim_not_open: 'Tokens cannot be claimed yet.',
  nothing_to_claim: 'This bid has no tokens to claim.',
  bid_not_returned: 'This bid has to be returned before its tokens can be claimed.',
  partial_exit_unavailable: 'The auction could not confirm the return for this bid right now.',
  settlement_reverted: 'The auction refused this step right now.',
};

function queryValue(req: Request, name: string) {
  const value = req.query[name];
  return typeof value === 'string' ? value : '';
}

function respond<T>(res: Response, result: AutolaunchReadResult<T>, present: (value: T) => unknown) {
  switch (result.kind) {
    case 'ok':
      return res.json(present(result.value));
    case 'refused':
      return sendError(res, 409, 'AutolaunchRefused', refusalCopy[result.reason]);
    case 'missing_rpc':
      console.error(`❌ [AUTOLAUNCH] ${result.requiredEnv} is not set; Base reads are unavailable`);
      return sendError(res, 503, 'BaseRpcMissing', 'Base is not configured on this server.');
    case 'rpc_error':
      console.error(`❌ [AUTOLAUNCH] Base read failed: ${result.name}`);
      return sendError(res, 502, 'BaseRpcError', 'The auction could not be read from Base right now.');
  }
}

export type AutolaunchRoutesInput = {
  readPosition?: AutolaunchPositionReader;
  prepareBid?: AutolaunchBidPreparer;
  prepareSettlement?: AutolaunchSettlementPreparer;
};

export function createAutolaunchRoutes(input: AutolaunchRoutesInput = {}) {
  const readPosition = input.readPosition ?? ((auction, wallet) => readAutolaunchPosition(auction, wallet));
  const prepareBid = input.prepareBid ?? ((bid) => prepareAutolaunchBid(bid));
  const prepareSettlement = input.prepareSettlement ?? ((settlement) => prepareAutolaunchSettlement(settlement));
  const router = Router();

  router.get('/mobile/autolaunch/auctions/:auction_address/position', async (req: Request, res: Response) => {
    const params = paramsSchema.safeParse(req.params);
    const query = positionQuerySchema.safeParse({ walletAddress: queryValue(req, 'walletAddress') });
    if (!params.success || !query.success) {
      return sendError(res, 400, 'BadRequest', 'A valid auction address and wallet address are required.');
    }

    const result = await readPosition(params.data.auction_address, query.data.walletAddress);
    return respond(res, result, (position) => ({ position }));
  });

  router.post('/mobile/autolaunch/auctions/:auction_address/bid', async (req: Request, res: Response) => {
    const params = paramsSchema.safeParse(req.params);
    const body = bidBodySchema.safeParse(req.body);
    if (!params.success || !body.success) {
      return sendError(res, 400, 'BadRequest', 'A valid auction address, wallet address and amount are required.');
    }

    const result = await prepareBid({
      auction: params.data.auction_address,
      wallet: body.data.walletAddress,
      amount: body.data.amount,
      maxPrice: body.data.maxPrice ?? null,
    });
    return respond(res, result, (wallet_action) => ({ wallet_action }));
  });

  router.post('/mobile/autolaunch/auctions/:auction_address/settle', async (req: Request, res: Response) => {
    const params = paramsSchema.safeParse(req.params);
    const body = settlementBodySchema.safeParse(req.body);
    if (!params.success || !body.success) {
      return sendError(res, 400, 'BadRequest', 'A valid auction address, wallet address and bid are required.');
    }

    const result = await prepareSettlement({
      auction: params.data.auction_address,
      wallet: body.data.walletAddress,
      bidId: BigInt(body.data.bidId),
    });
    return respond(res, result, (wallet_action) => ({ wallet_action }));
  });

  return router;
}
