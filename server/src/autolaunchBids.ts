import {
  createPublicClient,
  decodeErrorResult,
  decodeEventLog,
  decodeFunctionResult,
  encodeFunctionData,
  erc20Abi,
  formatUnits,
  http,
  parseUnits,
  type Address,
  type Hex,
} from 'viem';
import { base } from 'viem/chains';

/**
 * Bidding on an Autolaunch auction on Base, read and prepared directly
 * against the auction contract (a Uniswap Continuous Clearing Auction, "CCA").
 *
 * Every call mirrors what autolaunch.sh prepares in
 * platform/lib/autolaunch/bid_actions.ex and bid_settlement_actions.ex on the
 * feat/autolaunch-chain-mode release candidate: the exact REGENT approval to
 * canonical Permit2, the exact short-lived Permit2 allowance for the auction,
 * the five-argument submitBid, then after the end exitBid (or
 * exitPartiallyFilledBid with checkpoint hints) and claimTokens.
 *
 * The auction pulls its currency through Permit2's allowance transfer, so a
 * plain ERC-20 approval to the auction would not work. Permit2's `approve` is
 * an ordinary call, which the app's smart account sends like any other.
 *
 * An auction is named by its Autolaunch id. The address and quote token come
 * from autolaunch.sh's public record, and the chain has to agree: code at the
 * address, and `currency()` equal to the recorded quote token.
 */
export const AUTOLAUNCH_CHAIN_ID = 8453;
export const AUTOLAUNCH_URL = 'https://autolaunch.sh';
export const PERMIT2_ADDRESS: Address = '0x000000000022D473030F116dDEE9F6B43aC78BA3';

const Q96 = 1n << 96n;
const UINT128_MAX = (1n << 128n) - 1n;
const UINT256_MAX = (1n << 256n) - 1n;
const UINT64_MAX = (1n << 64n) - 1n;
/** Launch tokens always carry eighteen decimals. */
const TOKEN_DECIMALS = 18;
/** A Permit2 allowance that would lapse within the review window is granted again. */
const REVIEW_SECONDS = 600;
const PERMIT2_SECONDS = 900;
const MAX_TICK_WALK = 256;
const MAX_CHECKPOINT_WALK = 256;
/** Bid events are read in windows this wide, so no single log query spans an entire auction. */
export const LOG_WINDOW_BLOCKS = 5_000n;
const AUTOLAUNCH_TIMEOUT_MS = 10_000;

const checkpointOutputs = [
  { name: 'clearingPrice', type: 'uint256' },
  { name: 'currencyRaisedAtClearingPriceQ96X7', type: 'uint256' },
  { name: 'cumulativeMpsPerPrice', type: 'uint256' },
  { name: 'cumulativeMps', type: 'uint24' },
  { name: 'prev', type: 'uint64' },
  { name: 'next', type: 'uint64' },
] as const;

const bidSubmittedEvent = {
  type: 'event',
  name: 'BidSubmitted',
  inputs: [
    { name: 'id', type: 'uint256', indexed: true },
    { name: 'owner', type: 'address', indexed: true },
    { name: 'priceQ96', type: 'uint256', indexed: false },
    { name: 'amount', type: 'uint128', indexed: false },
  ],
} as const;

export const continuousClearingAuctionAbi = [
  {
    type: 'function',
    name: 'submitBid',
    stateMutability: 'payable',
    inputs: [
      { name: 'maxPriceQ96', type: 'uint256' },
      { name: 'amount', type: 'uint128' },
      { name: 'owner', type: 'address' },
      { name: 'prevTickPriceQ96', type: 'uint256' },
      { name: 'hookData', type: 'bytes' },
    ],
    outputs: [{ name: 'bidId', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'exitBid',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'bidId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'exitPartiallyFilledBid',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'bidId', type: 'uint256' },
      { name: 'lastFullyFilledCheckpointBlock', type: 'uint64' },
      { name: 'outbidBlock', type: 'uint64' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'claimTokens',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'bidId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'checkpoint',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [{ name: '', type: 'tuple', components: checkpointOutputs }],
  },
  {
    type: 'function',
    name: 'checkpoints',
    stateMutability: 'view',
    inputs: [{ name: 'blockNumber', type: 'uint64' }],
    outputs: [{ name: '', type: 'tuple', components: checkpointOutputs }],
  },
  {
    type: 'function',
    name: 'ticks',
    stateMutability: 'view',
    inputs: [{ name: 'priceQ96', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'next', type: 'uint256' },
          { name: 'currencyDemandQ96', type: 'uint256' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'bids',
    stateMutability: 'view',
    inputs: [{ name: 'bidId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'startBlock', type: 'uint64' },
          { name: 'startCumulativeMps', type: 'uint24' },
          { name: 'exitedBlock', type: 'uint64' },
          { name: 'maxPrice', type: 'uint256' },
          { name: 'owner', type: 'address' },
          { name: 'amountQ96', type: 'uint256' },
          { name: 'tokensFilled', type: 'uint256' },
        ],
      },
    ],
  },
  { type: 'function', name: 'currency', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
  { type: 'function', name: 'token', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
  { type: 'function', name: 'tickSpacing', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'floorPrice', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'MAX_BID_PRICE', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'clearingPrice', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'isGraduated', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'bool' }] },
  { type: 'function', name: 'startBlock', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint64' }] },
  { type: 'function', name: 'endBlock', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint64' }] },
  { type: 'function', name: 'claimBlock', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint64' }] },
  bidSubmittedEvent,
  {
    type: 'event',
    name: 'BidExited',
    inputs: [
      { name: 'bidId', type: 'uint256', indexed: true },
      { name: 'owner', type: 'address', indexed: true },
      { name: 'tokensFilled', type: 'uint256', indexed: false },
      { name: 'currencyRefunded', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'TokensClaimed',
    inputs: [
      { name: 'bidId', type: 'uint256', indexed: true },
      { name: 'owner', type: 'address', indexed: true },
      { name: 'tokensFilled', type: 'uint256', indexed: false },
    ],
  },
  { type: 'error', name: 'AuctionIsNotOver', inputs: [] },
  { type: 'error', name: 'BidAlreadyExited', inputs: [] },
  { type: 'error', name: 'CannotExitBid', inputs: [] },
  { type: 'error', name: 'NotClaimable', inputs: [] },
  { type: 'error', name: 'NotGraduated', inputs: [] },
  { type: 'error', name: 'BidNotExited', inputs: [] },
  { type: 'error', name: 'AuctionNotStarted', inputs: [] },
  { type: 'error', name: 'InvalidLastFullyFilledCheckpointHint', inputs: [] },
  { type: 'error', name: 'InvalidOutbidBlockCheckpointHint', inputs: [] },
  { type: 'error', name: 'CannotPartiallyExitBidBeforeEndBlock', inputs: [] },
  { type: 'error', name: 'CannotPartiallyExitBidBeforeGraduation', inputs: [] },
] as const;

export const permit2Abi = [
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint48' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint48' },
      { name: 'nonce', type: 'uint48' },
    ],
  },
] as const;

// The auction's own refusals, as the reason a step is not offered.
const settlementReasons: Record<string, AutolaunchSettlementReason> = {
  AuctionIsNotOver: 'auction_not_ended',
  BidAlreadyExited: 'already_returned',
  CannotExitBid: 'bid_needs_partial_exit',
  NotClaimable: 'claim_not_open',
  NotGraduated: 'nothing_to_claim',
  BidNotExited: 'bid_not_returned',
  AuctionNotStarted: 'auction_not_started',
  InvalidLastFullyFilledCheckpointHint: 'partial_exit_unavailable',
  InvalidOutbidBlockCheckpointHint: 'partial_exit_unavailable',
  CannotPartiallyExitBidBeforeEndBlock: 'auction_not_ended',
  CannotPartiallyExitBidBeforeGraduation: 'auction_not_ended',
};

export type AutolaunchSettlementReason =
  | 'auction_not_ended'
  | 'auction_not_started'
  | 'already_returned'
  | 'bid_needs_partial_exit'
  | 'claim_not_open'
  | 'nothing_to_claim'
  | 'bid_not_returned'
  | 'partial_exit_unavailable'
  | 'settlement_reverted';

export type AutolaunchAuctionPhase = 'not_started' | 'open' | 'ended' | 'claimable';

export type AutolaunchWalletCall = {
  step: 'token_approval' | 'permit2_approval' | 'bid' | 'exit' | 'claim';
  to: Address;
  value: '0';
  data: Hex;
};

export type AutolaunchBidWalletAction = {
  action: 'bid';
  chain_id: typeof AUTOLAUNCH_CHAIN_ID;
  auction_id: string;
  auction_address: Address;
  expected_signer: Address;
  block_number: number;
  calls: AutolaunchWalletCall[];
  amount: string;
  amount_raw: string;
  /** The exact maximum the bid carries, aligned down to the auction's price step. */
  max_price: string;
};

/**
 * Whether the amounts come from a simulated settlement. When the simulation
 * itself could not run, the steps are the ones the auction's rules allow at
 * this block and the amounts are only known after collecting.
 */
export type AutolaunchSettlementPreview = 'ready' | 'unavailable';

export type AutolaunchSettlementWalletAction = {
  action: 'settle';
  chain_id: typeof AUTOLAUNCH_CHAIN_ID;
  auction_id: string;
  auction_address: Address;
  expected_signer: Address;
  block_number: number;
  bid_id: string;
  calls: AutolaunchWalletCall[];
  preview: AutolaunchSettlementPreview;
  currency_refunded: string | null;
  tokens_claimed: string | null;
};

export type AutolaunchBidSettlement = {
  steps: ('exit' | 'claim')[];
  preview: AutolaunchSettlementPreview;
  currency_refunded: string | null;
  tokens_claimed: string | null;
  reason: AutolaunchSettlementReason | 'auction_open' | null;
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
  chain_id: typeof AUTOLAUNCH_CHAIN_ID;
  block_number: number;
  auction_id: string;
  auction_address: Address;
  currency_address: Address;
  currency_decimals: number;
  token_address: Address;
  start_block: number;
  end_block: number;
  claim_block: number;
  phase: AutolaunchAuctionPhase;
  /** As the final checkpoint records it once the auction has ended; null when that could not be read. */
  graduated: boolean | null;
  wallet_address: Address;
  wallet_currency_balance_raw: string;
  wallet_currency_balance: string;
  bids: AutolaunchBidPosition[];
};

export type AutolaunchRefusal =
  | 'auction_not_found'
  | 'auction_not_on_base'
  | 'auction_missing_on_chain'
  | 'auction_currency_changed'
  | 'auction_not_biddable'
  | 'invalid_amount'
  | 'invalid_price'
  | 'price_below_admissible_tick'
  | 'amount_above_balance'
  | 'bid_preparation_unavailable'
  | 'bid_not_found'
  | 'not_your_bid'
  | AutolaunchSettlementReason;

/**
 * A failed read carries only the error's name: viem's messages quote the RPC
 * URL, which may hold a key, so they never reach a log or a response.
 */
export type AutolaunchReadResult<T> =
  | { kind: 'ok'; value: T }
  | { kind: 'refused'; reason: AutolaunchRefusal }
  | { kind: 'missing_rpc'; requiredEnv: 'BASE_RPC_URL' }
  | { kind: 'rpc_error'; name: string }
  | { kind: 'autolaunch_error'; name: string };

export type AutolaunchPositionReader = (
  auctionId: string,
  wallet: Address,
) => Promise<AutolaunchReadResult<AutolaunchAuctionPosition>>;
export type AutolaunchBidPreparer = (input: {
  auctionId: string;
  wallet: Address;
  amount: string;
  maxPrice: string;
}) => Promise<AutolaunchReadResult<AutolaunchBidWalletAction>>;
export type AutolaunchSettlementPreparer = (input: {
  auctionId: string;
  wallet: Address;
  bidId: bigint;
}) => Promise<AutolaunchReadResult<AutolaunchSettlementWalletAction>>;

/** The Autolaunch record that names an auction: its address and the quote token it raises. */
export type AutolaunchAuctionRecord = {
  id: string;
  address: Address;
  quoteToken: Address;
};

/** Looks an auction up by id; null when Autolaunch has no such auction, a throw when it could not answer. */
export type AutolaunchAuctionResolver = (auctionId: string) => Promise<AutolaunchAuctionRecord | null>;

export type AutolaunchReadOptions = {
  rpcUrl?: string;
  resolveAuction?: AutolaunchAuctionResolver;
};

function baseRpcUrl() {
  return process.env.BASE_RPC_URL?.trim() || '';
}

class AutolaunchUnavailable extends Error {
  constructor(cause: unknown) {
    super('autolaunch_unavailable');
    this.name = cause instanceof Error ? cause.name || 'Error' : typeof cause;
  }
}

function isAddressString(value: unknown): value is Address {
  return typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value);
}

/**
 * autolaunch.sh's public auction JSON. Only a Base auction with an address
 * and a quote token address is a record this module can bind to.
 */
export async function fetchAutolaunchAuction(auctionId: string): Promise<AutolaunchAuctionRecord | null> {
  let response: Response;
  try {
    response = await fetch(`${AUTOLAUNCH_URL}/api/v1/auctions/${encodeURIComponent(auctionId)}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(AUTOLAUNCH_TIMEOUT_MS),
    });
  } catch (error) {
    throw new AutolaunchUnavailable(error);
  }

  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new AutolaunchUnavailable(new Error(`HTTP ${response.status}`));
  }

  const body = (await response.json().catch((error: unknown) => {
    throw new AutolaunchUnavailable(error);
  })) as { data?: { id?: unknown; chain?: unknown; chain_id?: unknown; address?: unknown; quote_token?: { address?: unknown } } };
  const auction = body.data;
  if (!auction || auction.chain !== 'base' || auction.chain_id !== AUTOLAUNCH_CHAIN_ID) {
    throw new Refused('auction_not_on_base');
  }
  if (typeof auction.id !== 'string' || !isAddressString(auction.address) || !isAddressString(auction.quote_token?.address)) {
    throw new Refused('auction_not_on_base');
  }

  return { id: auction.id, address: auction.address, quoteToken: auction.quote_token.address };
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function sameAddress(first: string, second: string) {
  return first.toLowerCase() === second.toLowerCase();
}

// Amounts and prices, exactly as bid_actions.ex and bid_price.ex compute them.

/** A positive amount of the auction's currency with at most `decimals` places, in atomic units. */
export function parseCurrencyAmount(value: string, decimals: number): bigint | null {
  const trimmed = value.trim();
  if (!new RegExp(`^\\d+(?:\\.\\d{1,${decimals}})?$`).test(trimmed)) {
    return null;
  }

  const atomic = parseUnits(trimmed, decimals);
  return atomic >= 1n && atomic <= UINT128_MAX ? atomic : null;
}

/**
 * The exact Q96 price a decimal maximum names, in currency base units per
 * token base unit: `price * 10^currency_decimals / 10^18`, scaled by 2^96.
 */
export function priceQ96FromDecimal(value: string, currencyDecimals: number): bigint | null {
  const trimmed = value.trim();
  if (trimmed.length > 100 || !/^\d+(?:\.\d+)?$/.test(trimmed)) {
    return null;
  }

  const [whole, fraction = ''] = trimmed.split('.');
  const numerator = BigInt(`${whole}${fraction}`);
  if (numerator <= 0n) {
    return null;
  }

  const scaled = numerator * Q96 * 10n ** BigInt(currencyDecimals);
  const quotient = scaled / 10n ** BigInt(fraction.length + TOKEN_DECIMALS);
  return quotient >= 1n && quotient <= UINT256_MAX ? quotient : null;
}

/** The decimal a Q96 price names in whole currency per whole token, never rounded. */
export function priceDecimalFromQ96(q96: bigint, currencyDecimals: number): string {
  return formatUnits(q96 * 5n ** 96n * 10n ** BigInt(TOKEN_DECIMALS), 96 + currencyDecimals);
}

export type AuctionPriceLimits = {
  tickSpacingQ96: bigint;
  floorPriceQ96: bigint;
  clearingPriceQ96: bigint;
  maxBidPriceQ96: bigint;
};

/**
 * The maximum aligned down to the auction's price step and capped at its
 * limit. A price is admissible when the floor sits on the grid and the price
 * is on or above the floor, above the clearing price and positive.
 */
export function alignPriceQ96(maximum: bigint, limits: AuctionPriceLimits): bigint | null {
  const { tickSpacingQ96: spacing, floorPriceQ96: floor, clearingPriceQ96: clearing, maxBidPriceQ96: cap } = limits;
  if (maximum <= 0n || spacing <= 0n || floor <= 0n || cap <= 0n) {
    return null;
  }

  const price = ((maximum < cap ? maximum : cap) / spacing) * spacing;
  return floor % spacing === 0n && price >= floor && price > clearing && price > 0n ? price : null;
}

// Calldata

export type BidSequenceInput = {
  auction: Address;
  signer: Address;
  currency: Address;
  amount: bigint;
  maxPriceQ96: bigint;
  prevTickPriceQ96: bigint;
  tokenAllowance: bigint;
  permit2Amount: bigint;
  permit2Expiration: bigint;
  now: number;
};

/**
 * Only the transactions this wallet still needs, in order: the exact currency
 * approval to Permit2, the exact Permit2 allowance for this auction that
 * outlives the review window, then the bid itself, owned by the signer.
 */
export function bidSequence(input: BidSequenceInput): AutolaunchWalletCall[] {
  const calls: AutolaunchWalletCall[] = [];

  if (input.tokenAllowance < input.amount) {
    calls.push({
      step: 'token_approval',
      to: input.currency,
      value: '0',
      data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [PERMIT2_ADDRESS, input.amount] }),
    });
  }

  const permit2Current =
    input.permit2Amount >= input.amount && input.permit2Expiration >= BigInt(input.now + REVIEW_SECONDS);
  if (!permit2Current) {
    calls.push({
      step: 'permit2_approval',
      to: PERMIT2_ADDRESS,
      value: '0',
      data: encodeFunctionData({
        abi: permit2Abi,
        functionName: 'approve',
        args: [input.currency, input.auction, input.amount, input.now + PERMIT2_SECONDS],
      }),
    });
  }

  calls.push({
    step: 'bid',
    to: input.auction,
    value: '0',
    data: encodeFunctionData({
      abi: continuousClearingAuctionAbi,
      functionName: 'submitBid',
      args: [input.maxPriceQ96, input.amount, input.signer, input.prevTickPriceQ96, '0x'],
    }),
  });

  return calls;
}

export type SettlementExit =
  | { kind: 'full' }
  | { kind: 'partial'; lastFullyFilledBlock: bigint; outbidBlock: bigint };

/** The exit that returns unspent currency, then the claim that delivers tokens. */
export function settlementSequence(input: {
  auction: Address;
  bidId: bigint;
  exit: SettlementExit | null;
  claim: boolean;
}): AutolaunchWalletCall[] {
  const calls: AutolaunchWalletCall[] = [];

  if (input.exit) {
    calls.push({ step: 'exit', to: input.auction, value: '0', data: exitCalldata(input.bidId, input.exit) });
  }

  if (input.claim) {
    calls.push({
      step: 'claim',
      to: input.auction,
      value: '0',
      data: encodeFunctionData({ abi: continuousClearingAuctionAbi, functionName: 'claimTokens', args: [input.bidId] }),
    });
  }

  return calls;
}

function exitCalldata(bidId: bigint, exit: SettlementExit): Hex {
  return exit.kind === 'full'
    ? encodeFunctionData({ abi: continuousClearingAuctionAbi, functionName: 'exitBid', args: [bidId] })
    : encodeFunctionData({
        abi: continuousClearingAuctionAbi,
        functionName: 'exitPartiallyFilledBid',
        args: [bidId, exit.lastFullyFilledBlock, exit.outbidBlock],
      });
}

// Chain reads

function baseClient(rpcUrl: string) {
  return createPublicClient({ chain: base, transport: http(rpcUrl) });
}

type Client = ReturnType<typeof baseClient>;

class Refused extends Error {
  constructor(readonly reason: AutolaunchRefusal) {
    super(reason);
    this.name = 'Refused';
  }
}

async function withClient<T>(
  options: AutolaunchReadOptions,
  read: (client: Client, blockNumber: bigint, resolveAuction: AutolaunchAuctionResolver) => Promise<T>,
): Promise<AutolaunchReadResult<T>> {
  const rpcUrl = options.rpcUrl ?? baseRpcUrl();
  if (!rpcUrl) {
    return { kind: 'missing_rpc', requiredEnv: 'BASE_RPC_URL' };
  }

  try {
    const client = baseClient(rpcUrl);
    const blockNumber = await client.getBlockNumber();
    return { kind: 'ok', value: await read(client, blockNumber, options.resolveAuction ?? fetchAutolaunchAuction) };
  } catch (error) {
    if (error instanceof Refused) {
      return { kind: 'refused', reason: error.reason };
    }
    if (error instanceof AutolaunchUnavailable) {
      return { kind: 'autolaunch_error', name: error.name };
    }

    return { kind: 'rpc_error', name: error instanceof Error ? error.name || 'Error' : typeof error };
  }
}

/**
 * The auction the id names, once the chain agrees with the record: code at
 * the recorded address and `currency()` equal to the recorded quote token.
 */
async function boundAuction(client: Client, auctionId: string, resolveAuction: AutolaunchAuctionResolver, blockNumber: bigint) {
  let record: AutolaunchAuctionRecord | null;
  try {
    record = await resolveAuction(auctionId);
  } catch (error) {
    if (error instanceof Refused || error instanceof AutolaunchUnavailable) throw error;
    throw new AutolaunchUnavailable(error);
  }
  if (!record) {
    throw new Refused('auction_not_found');
  }

  const code = await client.getCode({ address: record.address, blockNumber });
  if (!code || code === '0x') {
    throw new Refused('auction_missing_on_chain');
  }

  const facts = await auctionFacts(client, record.address, blockNumber);
  if (!sameAddress(facts.currency, record.quoteToken)) {
    throw new Refused('auction_currency_changed');
  }

  return { record, facts };
}

function phaseAt(blockNumber: bigint, blocks: { start: bigint; end: bigint; claim: bigint }): AutolaunchAuctionPhase {
  if (blockNumber < blocks.start) return 'not_started';
  if (blockNumber < blocks.end) return 'open';
  if (blockNumber < blocks.claim) return 'ended';
  return 'claimable';
}

async function auctionFacts(client: Client, auction: Address, blockNumber: bigint) {
  const contract = { address: auction, abi: continuousClearingAuctionAbi } as const;
  const [currency, token, tickSpacing, floorPrice, maxBidPrice, startBlock, endBlock, claimBlock, graduated] =
    await client.multicall({
      allowFailure: false,
      blockNumber,
      contracts: [
        { ...contract, functionName: 'currency' },
        { ...contract, functionName: 'token' },
        { ...contract, functionName: 'tickSpacing' },
        { ...contract, functionName: 'floorPrice' },
        { ...contract, functionName: 'MAX_BID_PRICE' },
        { ...contract, functionName: 'startBlock' },
        { ...contract, functionName: 'endBlock' },
        { ...contract, functionName: 'claimBlock' },
        { ...contract, functionName: 'isGraduated' },
      ],
    });

  return {
    currency,
    token,
    tickSpacing,
    floorPrice,
    maxBidPrice,
    startBlock: BigInt(startBlock),
    endBlock: BigInt(endBlock),
    claimBlock: BigInt(claimBlock),
    graduated,
  };
}

async function walletCurrency(client: Client, currency: Address, wallet: Address, auction: Address, blockNumber: bigint) {
  const [decimals, balance, tokenAllowance, permit2Allowance] = await client.multicall({
    allowFailure: false,
    blockNumber,
    contracts: [
      { address: currency, abi: erc20Abi, functionName: 'decimals' },
      { address: currency, abi: erc20Abi, functionName: 'balanceOf', args: [wallet] },
      { address: currency, abi: erc20Abi, functionName: 'allowance', args: [wallet, PERMIT2_ADDRESS] },
      { address: PERMIT2_ADDRESS, abi: permit2Abi, functionName: 'allowance', args: [wallet, currency, auction] },
    ],
  });

  return {
    decimals,
    balance,
    tokenAllowance,
    permit2Amount: permit2Allowance[0],
    permit2Expiration: BigInt(permit2Allowance[1]),
  };
}

/** The clearing price as the next checkpoint would record it, from a simulated `checkpoint()`. */
async function currentClearingPrice(client: Client, auction: Address, blockNumber: bigint) {
  const { data } = await client.call({
    to: auction,
    data: encodeFunctionData({ abi: continuousClearingAuctionAbi, functionName: 'checkpoint' }),
    blockNumber,
  });
  if (!data) {
    throw new Refused('bid_preparation_unavailable');
  }

  return decodeFunctionResult({ abi: continuousClearingAuctionAbi, functionName: 'checkpoint', data }).clearingPrice;
}

/**
 * The tick immediately below the bid's price, walked from the floor through
 * the auction's own tick list. Bounded, and refused rather than guessed.
 */
async function predecessorTick(client: Client, auction: Address, floor: bigint, price: bigint, blockNumber: bigint) {
  if (floor >= price) {
    throw new Refused('bid_preparation_unavailable');
  }

  let current = floor;
  for (let hops = 0; hops < MAX_TICK_WALK; hops += 1) {
    const { next } = await client.readContract({
      address: auction,
      abi: continuousClearingAuctionAbi,
      functionName: 'ticks',
      args: [current],
      blockNumber,
    });

    if (next === UINT256_MAX || next >= price) {
      return current;
    }
    if (next <= current) {
      throw new Refused('bid_preparation_unavailable');
    }
    current = next;
  }

  throw new Refused('bid_preparation_unavailable');
}

/** The ids of every bid the wallet placed, read window by window from the auction's start. */
async function walletBids(client: Client, auction: Address, wallet: Address, fromBlock: bigint, toBlock: bigint) {
  const ids: bigint[] = [];

  for (let windowStart = fromBlock; windowStart <= toBlock; windowStart += LOG_WINDOW_BLOCKS) {
    const windowEnd = windowStart + LOG_WINDOW_BLOCKS - 1n < toBlock ? windowStart + LOG_WINDOW_BLOCKS - 1n : toBlock;
    const logs = await client.getLogs({
      address: auction,
      event: bidSubmittedEvent,
      args: { owner: wallet },
      fromBlock: windowStart,
      toBlock: windowEnd,
    });
    ids.push(...logs.map((log) => log.args.id!));
  }

  return ids.sort((first, second) => (first < second ? -1 : first > second ? 1 : 0));
}

type BidRecord = {
  id: bigint;
  startBlock: bigint;
  exitedBlock: bigint;
  maxPrice: bigint;
  owner: Address;
  amount: bigint;
  tokensFilled: bigint;
};

async function bidRecords(client: Client, auction: Address, ids: bigint[], blockNumber: bigint): Promise<BidRecord[]> {
  if (ids.length === 0) {
    return [];
  }

  const records = await client.multicall({
    allowFailure: false,
    blockNumber,
    contracts: ids.map((id) => ({
      address: auction,
      abi: continuousClearingAuctionAbi,
      functionName: 'bids' as const,
      args: [id] as const,
    })),
  });

  return records.map((record, index) => ({
    id: ids[index]!,
    startBlock: BigInt(record.startBlock),
    exitedBlock: BigInt(record.exitedBlock),
    maxPrice: record.maxPrice,
    owner: record.owner,
    amount: record.amountQ96 / Q96,
    tokensFilled: record.tokensFilled,
  }));
}

type SimulatedCall = { status: 'success' | 'failure'; data: Hex; logs?: { topics: readonly Hex[]; data: Hex; address: Address }[] };

/** One simulated block of calls on top of the pinned block, in order, from the bid's owner. */
async function simulate(client: Client, blockNumber: bigint, calls: { to: Address; data: Hex; from?: Address }[]) {
  const [block] = await client.simulateBlocks({ blockNumber, blocks: [{ calls }] });
  return block!.calls.map((call) => ({ status: call.status, data: call.data, logs: call.logs })) as SimulatedCall[];
}

function refusalOf(call: SimulatedCall): AutolaunchSettlementReason {
  try {
    const decoded = decodeErrorResult({ abi: continuousClearingAuctionAbi, data: call.data });
    return settlementReasons[decoded.errorName] ?? 'settlement_reverted';
  } catch {
    return 'settlement_reverted';
  }
}

function eventArgs<TName extends 'BidExited' | 'TokensClaimed'>(call: SimulatedCall, auction: Address, eventName: TName) {
  for (const log of call.logs ?? []) {
    if (!sameAddress(log.address, auction)) continue;
    try {
      const decoded = decodeEventLog({
        abi: continuousClearingAuctionAbi,
        eventName,
        topics: log.topics as [Hex, ...Hex[]],
        data: log.data,
      });
      return decoded.args;
    } catch {
      continue;
    }
  }

  return null;
}

type ExitOutcome =
  | { kind: 'ok'; exit: SettlementExit; tokensFilled: bigint; currencyRefunded: bigint }
  | { kind: 'refused'; reason: AutolaunchSettlementReason };
type ClaimOutcome = { kind: 'ok'; tokensClaimed: bigint } | { kind: 'refused'; reason: AutolaunchSettlementReason };

function exitOutcome(call: SimulatedCall, auction: Address, exit: SettlementExit): ExitOutcome {
  if (call.status !== 'success') {
    return { kind: 'refused', reason: refusalOf(call) };
  }

  const args = eventArgs(call, auction, 'BidExited');
  if (!args || !('currencyRefunded' in args)) {
    return { kind: 'refused', reason: 'settlement_reverted' };
  }

  return { kind: 'ok', exit, tokensFilled: args.tokensFilled, currencyRefunded: args.currencyRefunded };
}

// A successful claim with no event is a bid that had nothing to claim.
function claimOutcome(call: SimulatedCall, auction: Address): ClaimOutcome {
  if (call.status !== 'success') {
    return { kind: 'refused', reason: refusalOf(call) };
  }

  const args = eventArgs(call, auction, 'TokensClaimed');
  return args && 'tokensFilled' in args && args.tokensFilled > 0n
    ? { kind: 'ok', tokensClaimed: args.tokensFilled }
    : { kind: 'refused', reason: 'nothing_to_claim' };
}

/**
 * What the auction would do for this bid right now: `checkpoint()` finalises
 * the clearing price exactly as the first settlement transaction would, then
 * the exit and the claim run from the bid's owner. A bid whose maximum is not
 * strictly above the final price needs `exitPartiallyFilledBid` with hints
 * derived from the auction's stored checkpoints, simulated the same way.
 */
async function simulateSettlement(client: Client, auction: Address, bid: BidRecord, endBlock: bigint, blockNumber: bigint) {
  const owner = bid.owner;
  const checkpointCall = { to: auction, data: encodeFunctionData({ abi: continuousClearingAuctionAbi, functionName: 'checkpoint' }) };
  const claimCall = {
    to: auction,
    from: owner,
    data: encodeFunctionData({ abi: continuousClearingAuctionAbi, functionName: 'claimTokens', args: [bid.id] }),
  };
  const fullExit: SettlementExit = { kind: 'full' };

  const [, clearingCall, exitCall, claimResult] = await simulate(client, blockNumber, [
    checkpointCall,
    { to: auction, data: encodeFunctionData({ abi: continuousClearingAuctionAbi, functionName: 'clearingPrice' }) },
    { to: auction, from: owner, data: exitCalldata(bid.id, fullExit) },
    claimCall,
  ]);

  const exit = exitOutcome(exitCall!, auction, fullExit);
  if (exit.kind === 'ok' || exit.reason !== 'bid_needs_partial_exit') {
    return { exit, claim: claimOutcome(claimResult!, auction) };
  }

  const clearingPrice = decodeFunctionResult({ abi: continuousClearingAuctionAbi, functionName: 'clearingPrice', data: clearingCall!.data });
  const hints = await checkpointHints(client, auction, bid, clearingPrice, endBlock, blockNumber);
  if (!hints) {
    return { exit: { kind: 'refused', reason: 'partial_exit_unavailable' } as ExitOutcome, claim: claimOutcome(claimResult!, auction) };
  }

  const partialExit: SettlementExit = { kind: 'partial', ...hints };
  const [, partialExitCall, partialClaimCall] = await simulate(client, blockNumber, [
    checkpointCall,
    { to: auction, from: owner, data: exitCalldata(bid.id, partialExit) },
    claimCall,
  ]);
  const partial = exitOutcome(partialExitCall!, auction, partialExit);

  return {
    exit: partial.kind === 'ok' ? partial : ({ kind: 'refused', reason: 'partial_exit_unavailable' } as ExitOutcome),
    claim: claimOutcome(partialClaimCall!, auction),
  };
}

/**
 * Follows `checkpoints(block).next` from the bid's own start checkpoint: the
 * last block whose clearing price is below the maximum, and the first stored
 * block whose price is above it, or the end block when only the checkpoint
 * the settlement itself writes crosses it. Zero when the final price equals
 * the maximum.
 */
async function checkpointHints(
  client: Client,
  auction: Address,
  bid: BidRecord,
  clearingPrice: bigint,
  endBlock: bigint,
  blockNumber: bigint,
): Promise<{ lastFullyFilledBlock: bigint; outbidBlock: bigint } | null> {
  let current = bid.startBlock;
  let lastFull: bigint | null = null;

  for (let hops = 0; hops < MAX_CHECKPOINT_WALK; hops += 1) {
    const checkpoint = await client.readContract({
      address: auction,
      abi: continuousClearingAuctionAbi,
      functionName: 'checkpoints',
      args: [current],
      blockNumber,
    });
    const price = checkpoint.clearingPrice;
    const next = BigInt(checkpoint.next);

    if (price < bid.maxPrice) lastFull = current;
    if (lastFull === null) return null;

    const outbid = price > bid.maxPrice ? current : next === UINT64_MAX ? endBlock : null;
    if (outbid !== null) {
      return { lastFullyFilledBlock: lastFull, outbidBlock: clearingPrice === bid.maxPrice ? 0n : outbid };
    }
    current = next;
  }

  return null;
}

type SettlementSteps = {
  calls: AutolaunchWalletCall[];
  steps: ('exit' | 'claim')[];
  currencyRefunded: bigint | null;
  tokensClaimed: bigint | null;
};

// The exit comes first whenever the auction accepts it; the claim follows
// only when the auction would deliver tokens right after that exit. An already
// returned bid with claimable fill has only the claim.
function eligibleSteps(auction: Address, bid: BidRecord, outcome: { exit: ExitOutcome; claim: ClaimOutcome }):
  | { kind: 'ok'; value: SettlementSteps }
  | { kind: 'refused'; reason: AutolaunchSettlementReason } {
  const { exit, claim } = outcome;

  if (exit.kind === 'refused' && exit.reason === 'already_returned' && claim.kind === 'ok') {
    return {
      kind: 'ok',
      value: {
        calls: settlementSequence({ auction, bidId: bid.id, exit: null, claim: true }),
        steps: ['claim'],
        currencyRefunded: null,
        tokensClaimed: claim.tokensClaimed,
      },
    };
  }

  if (exit.kind === 'ok') {
    const claimed = claim.kind === 'ok';
    return {
      kind: 'ok',
      value: {
        calls: settlementSequence({ auction, bidId: bid.id, exit: exit.exit, claim: claimed }),
        steps: claimed ? ['exit', 'claim'] : ['exit'],
        currencyRefunded: exit.currencyRefunded,
        tokensClaimed: claimed ? claim.tokensClaimed : null,
      },
    };
  }

  return {
    kind: 'refused',
    reason: exit.reason === 'already_returned' && claim.kind === 'refused' ? claim.reason : exit.reason,
  };
}

type SettlementDecision =
  | { kind: 'ok'; preview: AutolaunchSettlementPreview; value: SettlementSteps }
  | { kind: 'refused'; reason: AutolaunchSettlementReason };

/**
 * The steps the wallet can send for this bid. With a working simulation the
 * auction's own answer decides them and the amounts are known. When the
 * simulation itself cannot run, the steps are what the auction's rules allow
 * at this block: the plain exit once the auction has ended, the claim once
 * the claim block has passed; a bid already returned only has the claim.
 */
async function settlementFor(
  client: Client,
  auction: Address,
  bid: BidRecord,
  blocks: { end: bigint; claim: bigint },
  blockNumber: bigint,
): Promise<SettlementDecision> {
  try {
    const outcome = await simulateSettlement(client, auction, bid, blocks.end, blockNumber);
    const decision = eligibleSteps(auction, bid, outcome);
    return decision.kind === 'ok' ? { ...decision, preview: 'ready' } : decision;
  } catch (error) {
    if (error instanceof Refused) throw error;
    console.error(`❌ [AUTOLAUNCH] settlement simulation unavailable: ${error instanceof Error ? error.name : typeof error}`);
  }

  const exit = bid.exitedBlock === 0n && blockNumber >= blocks.end;
  const claim = blockNumber >= blocks.claim;
  if (!exit && !claim) {
    return { kind: 'refused', reason: blockNumber < blocks.end ? 'auction_not_ended' : 'claim_not_open' };
  }
  const steps: ('exit' | 'claim')[] = [...(exit ? (['exit'] as const) : []), ...(claim ? (['claim'] as const) : [])];

  return {
    kind: 'ok',
    preview: 'unavailable',
    value: {
      calls: settlementSequence({ auction, bidId: bid.id, exit: exit ? { kind: 'full' } : null, claim }),
      steps,
      currencyRefunded: null,
      tokensClaimed: null,
    },
  };
}

/**
 * Whether the auction graduated as its final checkpoint records it. The stored
 * flag only turns once someone checkpoints after the end, so it is read after
 * a simulated `checkpoint()`, exactly as the first settlement would see it.
 */
async function finalGraduation(client: Client, auction: Address, blockNumber: bigint): Promise<boolean | null> {
  try {
    const [, graduatedCall] = await simulate(client, blockNumber, [
      { to: auction, data: encodeFunctionData({ abi: continuousClearingAuctionAbi, functionName: 'checkpoint' }) },
      { to: auction, data: encodeFunctionData({ abi: continuousClearingAuctionAbi, functionName: 'isGraduated' }) },
    ]);
    if (graduatedCall!.status !== 'success') {
      return null;
    }

    return decodeFunctionResult({ abi: continuousClearingAuctionAbi, functionName: 'isGraduated', data: graduatedCall!.data });
  } catch (error) {
    console.error(`❌ [AUTOLAUNCH] final checkpoint simulation unavailable: ${error instanceof Error ? error.name : typeof error}`);
    return null;
  }
}

/**
 * One wallet's picture of one auction, every figure read at the same Base
 * block: where the auction stands, the wallet's currency, and each of its
 * bids with what settling it would do right now.
 */
export async function readAutolaunchPosition(
  auctionId: string,
  wallet: Address,
  options: AutolaunchReadOptions = {},
): Promise<AutolaunchReadResult<AutolaunchAuctionPosition>> {
  return withClient(options, async (client, blockNumber, resolveAuction) => {
    const { record, facts } = await boundAuction(client, auctionId, resolveAuction, blockNumber);
    const auction = record.address;
    const money = await walletCurrency(client, facts.currency, wallet, auction, blockNumber);
    const phase = phaseAt(blockNumber, { start: facts.startBlock, end: facts.endBlock, claim: facts.claimBlock });
    const graduated =
      phase === 'ended' || phase === 'claimable' ? await finalGraduation(client, auction, blockNumber) : facts.graduated;
    const lastBidBlock = blockNumber < facts.endBlock ? blockNumber : facts.endBlock;
    const ids = await walletBids(client, auction, wallet, facts.startBlock, lastBidBlock);
    const records = await bidRecords(client, auction, ids, blockNumber);

    const bids: AutolaunchBidPosition[] = [];
    for (const bid of records) {
      bids.push({
        bid_id: bid.id.toString(),
        amount_raw: bid.amount.toString(),
        amount: formatUnits(bid.amount, money.decimals),
        max_price: priceDecimalFromQ96(bid.maxPrice, money.decimals),
        returned: bid.exitedBlock !== 0n,
        tokens_filled: formatUnits(bid.tokensFilled, TOKEN_DECIMALS),
        settlement: await bidSettlementView(
          client,
          auction,
          bid,
          { end: facts.endBlock, claim: facts.claimBlock },
          blockNumber,
          phase,
          money.decimals,
        ),
      });
    }

    return {
      chain_id: AUTOLAUNCH_CHAIN_ID,
      block_number: Number(blockNumber),
      auction_id: record.id,
      auction_address: auction,
      currency_address: facts.currency,
      currency_decimals: money.decimals,
      token_address: facts.token,
      start_block: Number(facts.startBlock),
      end_block: Number(facts.endBlock),
      claim_block: Number(facts.claimBlock),
      phase,
      graduated,
      wallet_address: wallet,
      wallet_currency_balance_raw: money.balance.toString(),
      wallet_currency_balance: formatUnits(money.balance, money.decimals),
      bids,
    };
  });
}

async function bidSettlementView(
  client: Client,
  auction: Address,
  bid: BidRecord,
  blocks: { end: bigint; claim: bigint },
  blockNumber: bigint,
  phase: AutolaunchAuctionPhase,
  currencyDecimals: number,
): Promise<AutolaunchBidSettlement> {
  if (phase === 'not_started' || phase === 'open') {
    return { steps: [], preview: 'ready', currency_refunded: null, tokens_claimed: null, reason: 'auction_open' };
  }

  const settlement = await settlementFor(client, auction, bid, blocks, blockNumber);
  if (settlement.kind === 'refused') {
    return { steps: [], preview: 'ready', currency_refunded: null, tokens_claimed: null, reason: settlement.reason };
  }

  return {
    steps: settlement.value.steps,
    preview: settlement.preview,
    currency_refunded:
      settlement.value.currencyRefunded === null ? null : formatUnits(settlement.value.currencyRefunded, currencyDecimals),
    tokens_claimed: settlement.value.tokensClaimed === null ? null : formatUnits(settlement.value.tokensClaimed, TOKEN_DECIMALS),
    reason: null,
  };
}

/**
 * Reviews one bid against the auction as it stands: the currency it raises,
 * the wallet's balance and allowances, the price grid, the clearing price the
 * next checkpoint would record, and the tick below the bid's own price.
 */
export async function prepareAutolaunchBid(
  input: { auctionId: string; wallet: Address; amount: string; maxPrice: string },
  options: AutolaunchReadOptions = {},
): Promise<AutolaunchReadResult<AutolaunchBidWalletAction>> {
  const { wallet } = input;

  return withClient(options, async (client, blockNumber, resolveAuction) => {
    const { record, facts } = await boundAuction(client, input.auctionId, resolveAuction, blockNumber);
    const auction = record.address;
    if (blockNumber < facts.startBlock || blockNumber >= facts.endBlock) {
      throw new Refused('auction_not_biddable');
    }

    const money = await walletCurrency(client, facts.currency, wallet, auction, blockNumber);
    const amount = parseCurrencyAmount(input.amount, money.decimals);
    if (amount === null) {
      throw new Refused('invalid_amount');
    }
    if (amount > money.balance) {
      throw new Refused('amount_above_balance');
    }

    const requested = priceQ96FromDecimal(input.maxPrice, money.decimals);
    if (requested === null) {
      throw new Refused('invalid_price');
    }

    const clearingPrice = await currentClearingPrice(client, auction, blockNumber);
    const maxPriceQ96 = alignPriceQ96(requested, {
      tickSpacingQ96: facts.tickSpacing,
      floorPriceQ96: facts.floorPrice,
      clearingPriceQ96: clearingPrice,
      maxBidPriceQ96: facts.maxBidPrice,
    });
    if (maxPriceQ96 === null) {
      throw new Refused('price_below_admissible_tick');
    }

    const prevTickPriceQ96 = await predecessorTick(client, auction, facts.floorPrice, maxPriceQ96, blockNumber);

    return {
      action: 'bid',
      chain_id: AUTOLAUNCH_CHAIN_ID,
      auction_id: record.id,
      auction_address: auction,
      expected_signer: wallet,
      block_number: Number(blockNumber),
      calls: bidSequence({
        auction,
        signer: wallet,
        currency: facts.currency,
        amount,
        maxPriceQ96,
        prevTickPriceQ96,
        tokenAllowance: money.tokenAllowance,
        permit2Amount: money.permit2Amount,
        permit2Expiration: money.permit2Expiration,
        now: nowSeconds(),
      }),
      amount: formatUnits(amount, money.decimals),
      amount_raw: amount.toString(),
      max_price: priceDecimalFromQ96(maxPriceQ96, money.decimals),
    };
  });
}

/**
 * The exact steps the auction accepts for one of the wallet's bids right
 * now. The bid's owner on chain has to be the wallet; anything the auction
 * refuses becomes a reason rather than a wallet prompt.
 */
export async function prepareAutolaunchSettlement(
  input: { auctionId: string; wallet: Address; bidId: bigint },
  options: AutolaunchReadOptions = {},
): Promise<AutolaunchReadResult<AutolaunchSettlementWalletAction>> {
  const { wallet, bidId } = input;

  return withClient(options, async (client, blockNumber, resolveAuction) => {
    const { record, facts } = await boundAuction(client, input.auctionId, resolveAuction, blockNumber);
    const auction = record.address;
    const [bid] = await bidRecords(client, auction, [bidId], blockNumber).catch(() => {
      throw new Refused('bid_not_found');
    });
    if (!bid || sameAddress(bid.owner, '0x0000000000000000000000000000000000000000')) {
      throw new Refused('bid_not_found');
    }
    if (!sameAddress(bid.owner, wallet)) {
      throw new Refused('not_your_bid');
    }

    const settlement = await settlementFor(client, auction, bid, { end: facts.endBlock, claim: facts.claimBlock }, blockNumber);
    if (settlement.kind === 'refused') {
      throw new Refused(settlement.reason);
    }

    const decimals = await client.readContract({ address: facts.currency, abi: erc20Abi, functionName: 'decimals', blockNumber });

    return {
      action: 'settle',
      chain_id: AUTOLAUNCH_CHAIN_ID,
      auction_id: record.id,
      auction_address: auction,
      expected_signer: wallet,
      block_number: Number(blockNumber),
      bid_id: bidId.toString(),
      calls: settlement.value.calls,
      preview: settlement.preview,
      currency_refunded:
        settlement.value.currencyRefunded === null ? null : formatUnits(settlement.value.currencyRefunded, decimals),
      tokens_claimed: settlement.value.tokensClaimed === null ? null : formatUnits(settlement.value.tokensClaimed, TOKEN_DECIMALS),
    };
  });
}
