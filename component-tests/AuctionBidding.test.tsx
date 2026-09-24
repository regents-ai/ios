import { act, fireEvent, waitFor } from '@testing-library/react-native';
import React from 'react';

import { AuctionBidding } from '@/components/autolaunch/AuctionBidding';
import type { AutolaunchAuctionPosition, AutolaunchBaseAuction } from '@/types/autolaunch';
import { renderThemed } from './helpers/renderThemed';

const PHONE_WALLET = '0xAbCdEf1111111111111111111111111111111111';
const UNAVAILABLE_COPY = "Bidding from the app isn't available for this auction right now. You can bid on autolaunch.sh.";

const mockCheckTreasury = jest.fn();
const mockGetPosition = jest.fn();
const mockPrepareBid = jest.fn();
const mockPrepareSettlement = jest.fn();
const mockSendUserOperation = jest.fn();
let mockFocusCallback: (() => void) | null = null;

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void) => {
    mockFocusCallback = callback;
  },
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@coinbase/cdp-hooks', () => ({
  useCurrentUser: () => ({ currentUser: { evmSmartAccounts: [PHONE_WALLET] } }),
  useSendUserOperation: () => ({
    sendUserOperation: (...args: unknown[]) => mockSendUserOperation(...args),
    status: 'idle',
    data: undefined,
    error: undefined,
  }),
}));

jest.mock('@/utils/autolaunch/treasuryCheck', () => ({
  checkAutolaunchTreasury: (...args: unknown[]) => mockCheckTreasury(...args),
}));

jest.mock('@/utils/autolaunch/bidApi', () => ({
  getAutolaunchPosition: (...args: unknown[]) => mockGetPosition(...args),
  prepareAutolaunchBid: (...args: unknown[]) => mockPrepareBid(...args),
  prepareAutolaunchSettlement: (...args: unknown[]) => mockPrepareSettlement(...args),
}));

jest.mock('@/utils/autolaunch/client', () => ({
  quoteAutolaunchBid: () => new Promise(() => {}),
}));

jest.mock('@/utils/onchain/autolaunchWalletAction', () => ({
  autolaunchNetworkForChain: () => 'base',
  autolaunchWalletCalls: () => [],
}));

const auction: AutolaunchBaseAuction = {
  id: '3f2c6c1e-9d3a-4a1f-8c2e-1b6f0d9e7a11',
  chain: 'base',
  chain_id: 8453,
  address: '0x1111111111111111111111111111111111111111',
  title: 'Atlas Research',
  token_symbol: 'ATLAS',
  summary: null,
  featured: false,
  kind: 'agent',
  state: 'active',
  opened_at: null,
  quote_token: { address: '0x2222222222222222222222222222222222222222', symbol: 'REGENT', decimals: 18 },
  clearing_price: null,
  treasury_security: null,
};

function position(overrides: Partial<AutolaunchAuctionPosition> = {}): AutolaunchAuctionPosition {
  return {
    chain_id: 8453,
    block_number: 1,
    auction_id: auction.id,
    auction_address: auction.address,
    currency_address: '0x2222222222222222222222222222222222222222',
    currency_decimals: 18,
    token_address: '0x3333333333333333333333333333333333333333',
    start_block: 1,
    end_block: 100,
    claim_block: 110,
    phase: 'open',
    graduated: null,
    wallet_address: PHONE_WALLET,
    wallet_currency_balance_raw: '0',
    wallet_currency_balance: '100',
    bids: [],
    ...overrides,
  };
}

const PASS = { ok: true };
const FAIL = { ok: false, reason: 'check_unavailable' };

async function renderBidding() {
  const screen = renderThemed(
    <AuctionBidding auction={auction} showAlert={jest.fn()} setToast={jest.fn()} openOnAutolaunch={jest.fn()} />
  );
  await act(async () => {
    mockFocusCallback?.();
  });
  return screen;
}

async function fillAndReview(screen: Awaited<ReturnType<typeof renderBidding>>) {
  fireEvent.changeText(screen.getByLabelText('Bid amount'), '10');
  fireEvent.changeText(screen.getByLabelText('Maximum price per token'), '0.5');
  await act(async () => {
    fireEvent.press(screen.getByText('Review bid'));
  });
}

describe('Auction bidding and the live treasury check', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFocusCallback = null;
    mockGetPosition.mockResolvedValue(position());
    mockPrepareBid.mockResolvedValue({ chain_id: 8453, calls: [] });
    mockPrepareSettlement.mockResolvedValue({ chain_id: 8453, calls: [] });
    mockSendUserOperation.mockResolvedValue({ userOperationHash: '0xabc' });
  });

  it('offers no bidding while the check does not pass, as when the website has no check yet', async () => {
    mockCheckTreasury.mockResolvedValue(FAIL);

    const screen = await renderBidding();

    await waitFor(() => expect(screen.getByText(UNAVAILABLE_COPY)).toBeTruthy());
    expect(screen.getByText('Open on Autolaunch')).toBeTruthy();
    expect(screen.queryByLabelText('Bid amount')).toBeNull();
    expect(mockCheckTreasury).toHaveBeenCalledWith(auction.id);
  });

  it('checks again when the review opens and keeps the review closed when that check fails', async () => {
    mockCheckTreasury.mockResolvedValueOnce(PASS).mockResolvedValueOnce(FAIL);

    const screen = await renderBidding();
    await waitFor(() => expect(screen.getByLabelText('Bid amount')).toBeTruthy());
    await fillAndReview(screen);

    expect(mockCheckTreasury).toHaveBeenCalledTimes(2);
    expect(screen.getByText(UNAVAILABLE_COPY)).toBeTruthy();
    expect(screen.queryByText('Place bid')).toBeNull();
  });

  it('checks again at Place bid, and a failure there never reaches the wallet', async () => {
    mockCheckTreasury.mockResolvedValueOnce(PASS).mockResolvedValueOnce(PASS).mockResolvedValueOnce(FAIL);

    const screen = await renderBidding();
    await waitFor(() => expect(screen.getByLabelText('Bid amount')).toBeTruthy());
    await fillAndReview(screen);
    expect(screen.getByText('Place bid')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByText('Place bid'));
    });

    expect(mockCheckTreasury).toHaveBeenCalledTimes(3);
    expect(mockSendUserOperation).not.toHaveBeenCalled();
    expect(screen.getByText(UNAVAILABLE_COPY)).toBeTruthy();
    expect(screen.queryByText('Place bid')).toBeNull();
  });

  it('sends the bid to the wallet when the check passes at review and at Place bid', async () => {
    mockCheckTreasury.mockResolvedValue(PASS);

    const screen = await renderBidding();
    await waitFor(() => expect(screen.getByLabelText('Bid amount')).toBeTruthy());
    await fillAndReview(screen);
    await act(async () => {
      fireEvent.press(screen.getByText('Place bid'));
    });

    expect(mockCheckTreasury).toHaveBeenCalledTimes(3);
    expect(mockPrepareBid).toHaveBeenCalledWith({
      auctionId: auction.id,
      walletAddress: PHONE_WALLET,
      amount: '10',
      maxPrice: '0.5',
    });
    expect(mockSendUserOperation).toHaveBeenCalledTimes(1);
  });

  it('collects a bid while the check does not pass, without asking for it', async () => {
    mockCheckTreasury.mockResolvedValue(FAIL);
    mockGetPosition.mockResolvedValue(
      position({
        phase: 'claimable',
        graduated: true,
        bids: [
          {
            bid_id: '7',
            amount_raw: '10',
            amount: '10',
            max_price: '0.5',
            returned: false,
            tokens_filled: '20',
            settlement: { steps: ['exit', 'claim'], preview: 'ready', currency_refunded: '1', tokens_claimed: '20', reason: null },
          },
        ],
      })
    );

    const screen = await renderBidding();
    await waitFor(() => expect(screen.getByText('Collect tokens and unspent money')).toBeTruthy());
    const checksBeforeCollect = mockCheckTreasury.mock.calls.length;

    await act(async () => {
      fireEvent.press(screen.getByText('Collect tokens and unspent money'));
    });

    expect(mockPrepareSettlement).toHaveBeenCalledWith({ auctionId: auction.id, walletAddress: PHONE_WALLET, bidId: '7' });
    expect(mockSendUserOperation).toHaveBeenCalledTimes(1);
    expect(mockCheckTreasury).toHaveBeenCalledTimes(checksBeforeCollect);
  });
});
