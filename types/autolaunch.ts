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

/** The public estimate from `POST /api/v1/auctions/:id/bid-quote`. */
export type AutolaunchBidQuote = {
  auction_id: string;
  amount: string;
  max_price: string;
  quote_token: AutolaunchQuoteToken;
  current_clearing_price: string;
  projected_clearing_price: string;
  would_be_active_now: boolean;
  status_band: string;
  estimated_tokens_if_end_now: string;
  warnings: string[];
};

/**
 * The app backend's view of one wallet on one Base auction, declared under
 * /mobile/autolaunch/auctions/{auction_id} in api-contract.openapiv3.yaml.
 */
export type AutolaunchAuctionPhase = 'not_started' | 'open' | 'ended' | 'claimable';

export type AutolaunchSettlementReason =
  | 'auction_open'
  | 'auction_not_ended'
  | 'auction_not_started'
  | 'already_returned'
  | 'bid_needs_partial_exit'
  | 'claim_not_open'
  | 'nothing_to_claim'
  | 'bid_not_returned'
  | 'partial_exit_unavailable'
  | 'settlement_reverted';

/**
 * Whether the amounts come from a simulated settlement. When the simulation
 * could not run, the steps are the ones the auction's rules allow and the
 * amounts are only known after collecting.
 */
export type AutolaunchSettlementPreview = 'ready' | 'unavailable';

export type AutolaunchBidSettlement = {
  steps: ('exit' | 'claim')[];
  preview: AutolaunchSettlementPreview;
  currency_refunded: string | null;
  tokens_claimed: string | null;
  reason: AutolaunchSettlementReason | null;
};

export type AutolaunchBidPosition = {
  bid_id: string;
  amount_raw: string;
  amount: string;
  max_price: string;
  returned: boolean;
  tokens_filled: string;
  settlement: AutolaunchBidSettlement;
};

export type AutolaunchAuctionPosition = {
  chain_id: number;
  block_number: number;
  auction_id: string;
  auction_address: string;
  currency_address: string;
  currency_decimals: number;
  token_address: string;
  start_block: number;
  end_block: number;
  claim_block: number;
  phase: AutolaunchAuctionPhase;
  /** As the final checkpoint records it once the auction has ended; null when that could not be read. */
  graduated: boolean | null;
  wallet_address: string;
  wallet_currency_balance_raw: string;
  wallet_currency_balance: string;
  bids: AutolaunchBidPosition[];
};

export type AutolaunchWalletCall = {
  step: 'token_approval' | 'permit2_approval' | 'bid' | 'exit' | 'claim';
  to: string;
  value: string;
  data: string;
};

export type AutolaunchBidWalletAction = {
  action: 'bid';
  chain_id: number;
  auction_id: string;
  auction_address: string;
  expected_signer: string;
  block_number: number;
  calls: AutolaunchWalletCall[];
  amount: string;
  amount_raw: string;
  max_price: string;
};

export type AutolaunchSettlementWalletAction = {
  action: 'settle';
  chain_id: number;
  auction_id: string;
  auction_address: string;
  expected_signer: string;
  block_number: number;
  bid_id: string;
  calls: AutolaunchWalletCall[];
  preview: AutolaunchSettlementPreview;
  currency_refunded: string | null;
  tokens_claimed: string | null;
};
