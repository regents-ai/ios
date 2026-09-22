/**
 * Plain-words presentation of an Autolaunch auction.
 *
 * Pure functions over the public JSON in types/autolaunch.ts: what the list
 * row and the detail screen say for a state, a kind, a price and a raise.
 * No theme or React imports so the node test lane can load it directly.
 */

import type {
  AutolaunchAuction,
  AutolaunchAuctionKind,
  AutolaunchAuctionState,
} from '../../types/autolaunch';

export type AuctionStatusTone = 'info' | 'success' | 'error';

export type AuctionStatus = {
  label: string;
  tone: AuctionStatusTone;
  /** True while bids are being taken. */
  open: boolean;
};

export function auctionStatus(state: AutolaunchAuctionState): AuctionStatus {
  switch (state) {
    case 'created':
      return { label: 'Not open yet', tone: 'info', open: false };
    case 'active':
      return { label: 'Open', tone: 'success', open: true };
    case 'graduated':
      return { label: 'Raised its minimum', tone: 'success', open: false };
    case 'failed':
      return { label: "Didn't reach its minimum", tone: 'error', open: false };
  }
}

export function launchKindLabel(kind: AutolaunchAuctionKind) {
  return kind === 'stocks' ? 'Memestock' : 'Revstake token';
}

export function chainLabel(chain: AutolaunchAuction['chain']) {
  return chain === 'robinhood' ? 'Robinhood' : 'Base';
}

/** What GET /api/v1/auctions/:id takes: a Base id, or a Robinhood address. */
export function auctionReference(auction: AutolaunchAuction) {
  return auction.chain === 'base' ? auction.id : auction.address;
}

/** The auction's own page on autolaunch.sh, relative to the site root. */
export function auctionWebPath(auction: AutolaunchAuction) {
  return auction.chain === 'base'
    ? `/auctions/${auction.id}`
    : `/robinhood/auctions/${auction.address}`;
}

/**
 * A decimal string shortened for reading: at most `significant` significant
 * digits, truncated (never rounded up) and marked with an ellipsis when digits
 * were cut, so a shown amount is never higher than the exact one.
 */
export function compactDecimal(value: string, significant = 8) {
  const [whole, fraction = ''] = value.split('.');
  const trimmedFraction = fraction.replace(/0+$/, '');
  if (!trimmedFraction) {
    return whole;
  }

  const leadingZeros =
    whole === '0' ? trimmedFraction.length - trimmedFraction.replace(/^0+/, '').length : 0;
  const keep = Math.max(significant - (whole === '0' ? 0 : whole.length), 1) + leadingZeros;
  if (trimmedFraction.length <= keep) {
    return `${whole}.${trimmedFraction}`;
  }

  return `${whole}.${trimmedFraction.slice(0, keep)}…`;
}

/** "0.05 REGENT", or the site's own words while no bid has set a price. */
export function priceCopy(auction: AutolaunchAuction) {
  const price = auction.clearing_price?.trim();
  if (!price) {
    return 'Price forming';
  }

  return amountCopy(price, auction.quote_token.symbol);
}

/** Robinhood auctions report their raise; Base auctions do not. */
export function raisedCopy(auction: AutolaunchAuction) {
  return auction.chain === 'robinhood'
    ? amountCopy(auction.raised, auction.quote_token.symbol)
    : null;
}

function amountCopy(amount: string, symbol: string | null) {
  const compact = compactDecimal(amount);
  return symbol ? `${compact} ${symbol}` : compact;
}

/** Title plus symbol, e.g. "Atlas Research (ATLAS)". */
export function nameCopy(auction: AutolaunchAuction) {
  return auction.token_symbol ? `${auction.title} (${auction.token_symbol})` : auction.title;
}
