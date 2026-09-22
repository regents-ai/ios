/**
 * Autolaunch's public auction JSON, as rendered by
 * platform/lib/autolaunch_web/controllers/auction_controller.ex on the
 * feat/autolaunch-chain-mode release candidate.
 *
 * A Base auction is a stored record named by its id. A Robinhood auction is
 * read from its chain and named by its address; the chain records no id,
 * summary, opening time or treasury report, so the entry carries none.
 */

export type AutolaunchAuctionState = 'created' | 'active' | 'graduated' | 'failed';
export type AutolaunchAuctionKind = 'agent' | 'stocks';

export type AutolaunchQuoteToken = {
  address: string | null;
  symbol: string | null;
  decimals: number | null;
};

type AutolaunchAuctionCommon = {
  chain_id: number;
  address: string;
  title: string;
  token_symbol: string | null;
  kind: AutolaunchAuctionKind;
  state: AutolaunchAuctionState;
  quote_token: AutolaunchQuoteToken;
  /** The current clearing price in the quote token, or null while it forms. */
  clearing_price: string | null;
};

export type AutolaunchBaseAuction = AutolaunchAuctionCommon & {
  chain: 'base';
  id: string;
  summary: string | null;
  featured: boolean;
  opened_at: string | null;
  treasury_security: unknown;
};

export type AutolaunchRobinhoodAuction = AutolaunchAuctionCommon & {
  chain: 'robinhood';
  launch_id: number;
  /** Quote token raised so far. */
  raised: string;
};

export type AutolaunchAuction = AutolaunchBaseAuction | AutolaunchRobinhoodAuction;

export type AutolaunchAuctionPage = {
  data: AutolaunchAuction[];
  pagination: {
    has_more: boolean;
    next_cursor: string | null;
  };
};
