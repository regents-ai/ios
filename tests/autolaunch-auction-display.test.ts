import test from 'node:test';
import assert from 'node:assert/strict';

import type { AutolaunchBaseAuction, AutolaunchRobinhoodAuction } from '../types/autolaunch';
import {
  auctionReference,
  auctionStatus,
  auctionWebPath,
  compactDecimal,
  priceCopy,
  raisedCopy,
} from '../utils/autolaunch/auctionDisplay';

// Shapes copied from auction_controller.ex on feat/autolaunch-chain-mode.
const base: AutolaunchBaseAuction = {
  id: '3f2c6c1e-9d3a-4a1f-8c2e-1b6f0d9e7a11',
  chain: 'base',
  chain_id: 8453,
  address: '0x1111111111111111111111111111111111111111',
  title: 'Atlas Research',
  token_symbol: 'ATLAS',
  summary: 'An agent team that turns market research into daily briefs.',
  featured: false,
  kind: 'agent',
  state: 'active',
  opened_at: '2026-09-22T14:03:00.000000Z',
  quote_token: { address: '0x2222222222222222222222222222222222222222', symbol: 'REGENT', decimals: 18 },
  clearing_price: '0.000012345678901',
  treasury_security: null,
};

const robinhood: AutolaunchRobinhoodAuction = {
  chain: 'robinhood',
  chain_id: 46,
  address: '0x3333333333333333333333333333333333333333',
  launch_id: 7,
  title: 'Moon Rocket',
  token_symbol: 'MOON',
  kind: 'stocks',
  state: 'failed',
  quote_token: { address: '0x4444444444444444444444444444444444444444', symbol: 'TSLAx', decimals: 18 },
  clearing_price: '1.25',
  raised: '4200.5',
};

test('auction state and amounts map to plain words the user sees', () => {
  // The user reads a status, never a state name.
  assert.equal(auctionStatus('created').label, 'Not open yet');
  assert.equal(auctionStatus('active').label, 'Open');
  assert.equal(auctionStatus('graduated').label, 'Raised its minimum');
  assert.equal(auctionStatus('failed').label, "Didn't reach its minimum");
  assert.equal(auctionStatus('active').open, true);
  assert.equal(auctionStatus('graduated').open, false);

  // A shown price is never higher than the exact one: truncated, not rounded.
  assert.equal(priceCopy(base), '0.000012345678… REGENT');
  assert.equal(priceCopy({ ...base, clearing_price: null }), 'Price forming');
  assert.equal(priceCopy({ ...base, clearing_price: '' }), 'Price forming');
  assert.equal(compactDecimal('1234.56789012'), '1234.5678…');
  assert.equal(compactDecimal('12.000'), '12');

  // Only Robinhood auctions report a raise; Base auctions show none.
  assert.equal(raisedCopy(robinhood), '4200.5 TSLAx');
  assert.equal(raisedCopy(base), null);

  // A Base auction is named by its id, a Robinhood auction by its address.
  assert.equal(auctionReference(base), base.id);
  assert.equal(auctionReference(robinhood), robinhood.address);
  assert.equal(auctionWebPath(base), `/auctions/${base.id}`);
  assert.equal(auctionWebPath(robinhood), `/robinhood/auctions/${robinhood.address}`);
});
