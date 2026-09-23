import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeFunctionData, erc20Abi } from 'viem';

import {
  PERMIT2_ADDRESS,
  alignPriceQ96,
  bidSequence,
  continuousClearingAuctionAbi,
  permit2Abi,
  priceDecimalFromQ96,
  priceQ96FromDecimal,
  settlementSequence,
} from './autolaunchBids.js';

const auction = '0x1111111111111111111111111111111111111111';
const regent = '0x6f89bcA4eA5931EdFCB09786267b251DeE752b07';
const wallet = '0x2222222222222222222222222222222222222222';

test('a prepared bid approves Permit2 exactly, allows the auction briefly, then bids as the wallet', () => {
  const amount = 25n * 10n ** 18n;
  const maxPriceQ96 = alignPriceQ96(priceQ96FromDecimal('0.05', 18)!, {
    tickSpacingQ96: 1n << 90n,
    floorPriceQ96: 1n << 90n,
    clearingPriceQ96: 2n << 90n,
    maxBidPriceQ96: 1n << 120n,
  })!;
  const now = 1_800_000_000;

  const calls = bidSequence({
    auction,
    signer: wallet,
    currency: regent,
    amount,
    maxPriceQ96,
    prevTickPriceQ96: 2n << 90n,
    tokenAllowance: 0n,
    permit2Amount: 0n,
    permit2Expiration: 0n,
    now,
  });

  assert.deepEqual(
    calls.map((call) => [call.step, call.to, call.value]),
    [
      ['token_approval', regent, '0'],
      ['permit2_approval', PERMIT2_ADDRESS, '0'],
      ['bid', auction, '0'],
    ],
  );

  const approval = decodeFunctionData({ abi: erc20Abi, data: calls[0]!.data });
  assert.equal(approval.functionName, 'approve');
  assert.deepEqual(approval.args, [PERMIT2_ADDRESS, amount]);

  const permit = decodeFunctionData({ abi: permit2Abi, data: calls[1]!.data });
  assert.equal(permit.functionName, 'approve');
  assert.deepEqual(permit.args, [regent, auction, amount, now + 900]);

  const bid = decodeFunctionData({ abi: continuousClearingAuctionAbi, data: calls[2]!.data });
  assert.equal(bid.functionName, 'submitBid');
  assert.deepEqual(bid.args, [maxPriceQ96, amount, wallet, 2n << 90n, '0x']);
  assert.equal(maxPriceQ96, 3n << 90n);
  assert.equal(maxPriceQ96 % (1n << 90n), 0n);
  assert.equal(priceDecimalFromQ96(priceQ96FromDecimal('0.05', 18)!, 18).startsWith('0.04999999'), true);
});

test('allowances that already cover the bid leave only the bid itself', () => {
  const calls = bidSequence({
    auction,
    signer: wallet,
    currency: regent,
    amount: 5n,
    maxPriceQ96: 1n << 96n,
    prevTickPriceQ96: 1n << 95n,
    tokenAllowance: 5n,
    permit2Amount: 5n,
    permit2Expiration: BigInt(1_800_000_000 + 700),
    now: 1_800_000_000,
  });

  assert.deepEqual(
    calls.map((call) => call.step),
    ['bid'],
  );
});

test('a prepared settlement exits the bid and then claims its tokens on the auction', () => {
  const calls = settlementSequence({ auction, bidId: 7n, exit: { kind: 'full' }, claim: true });
  assert.deepEqual(
    calls.map((call) => [call.step, call.to]),
    [
      ['exit', auction],
      ['claim', auction],
    ],
  );

  const exit = decodeFunctionData({ abi: continuousClearingAuctionAbi, data: calls[0]!.data });
  assert.equal(exit.functionName, 'exitBid');
  assert.deepEqual(exit.args, [7n]);

  const claim = decodeFunctionData({ abi: continuousClearingAuctionAbi, data: calls[1]!.data });
  assert.equal(claim.functionName, 'claimTokens');
  assert.deepEqual(claim.args, [7n]);

  const [partial] = settlementSequence({
    auction,
    bidId: 7n,
    exit: { kind: 'partial', lastFullyFilledBlock: 100n, outbidBlock: 0n },
    claim: false,
  });
  const partialExit = decodeFunctionData({ abi: continuousClearingAuctionAbi, data: partial!.data });
  assert.equal(partialExit.functionName, 'exitPartiallyFilledBid');
  assert.deepEqual(partialExit.args, [7n, 100n, 0n]);
});
