import { act, fireEvent, waitFor } from '@testing-library/react-native';
import React from 'react';

import PaymentRequestScreen from '@/app/request/[id]';
import type { PaymentRequest } from '@/types/regents';
import { ApiError } from '@/utils/apiError';
import { renderThemed } from './helpers/renderThemed';

const mockGetPaymentRequest = jest.fn();
const mockGetPortfolio = jest.fn();
const mockPreparePaymentRequest = jest.fn();
const mockPush = jest.fn();
let mockSmartAccounts: string[] = [];
let mockFocusCallback: (() => void) | null = null;

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void) => {
    mockFocusCallback = callback;
  },
  useLocalSearchParams: () => ({ id: 'req-1' }),
  useRouter: () => ({ push: mockPush, back: jest.fn(), setParams: jest.fn() }),
}));

jest.mock('@coinbase/cdp-hooks', () => ({
  useCurrentUser: () => ({ currentUser: { evmSmartAccounts: mockSmartAccounts } }),
  useSendUserOperation: () => ({ sendUserOperation: jest.fn(), status: 'idle', data: undefined, error: undefined }),
  useGetAccessToken: () => ({ getAccessToken: jest.fn() }),
}));

jest.mock('@/utils/regentApi/client', () => ({
  regentApi: {
    getPaymentRequest: (...args: unknown[]) => mockGetPaymentRequest(...args),
    getPortfolio: (...args: unknown[]) => mockGetPortfolio(...args),
    preparePaymentRequest: (...args: unknown[]) => mockPreparePaymentRequest(...args),
  },
}));

const WALLET = '0x1111222233334444555566667777888899990001';

function phoneWalletHolds(usdc: string) {
  mockGetPortfolio.mockResolvedValue({
    chain_id: 8453,
    block_number: 1,
    wallets: [{
      wallet_address: '0xAbCdEf1111111111111111111111111111111111',
      eth_balance: '0',
      usdc_balance: usdc,
      regent_balance: '0',
      staked_regent: '0',
      claimable_usdc: '0',
      claimable_regent: '0',
    }],
  });
}

function request(overrides: Partial<PaymentRequest> = {}): PaymentRequest {
  return {
    id: 'req-1',
    agentId: 'agent-1',
    agentName: 'Muse',
    agentWallet: WALLET,
    to: WALLET,
    amount: '5.00',
    amountRaw: '5000000',
    note: 'Domain renewal',
    createdAt: new Date().toISOString(),
    status: 'waiting',
    txHash: null,
    ...overrides,
  };
}

async function renderScreen() {
  const screen = renderThemed(<PaymentRequestScreen />);
  await act(async () => {
    mockFocusCallback?.();
  });
  return screen;
}

describe('Payment request screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSmartAccounts = ['0xAbCdEf1111111111111111111111111111111111'];
    phoneWalletHolds('100');
    mockPreparePaymentRequest.mockRejectedValue(new Error('not needed here'));
  });

  it('explains a failed load and reads the request again on Try again', async () => {
    mockGetPaymentRequest.mockRejectedValueOnce(new ApiError('server', 'The request could not be read right now.', 503));

    const screen = await renderScreen();

    await waitFor(() => expect(screen.getByText('Something went wrong on our side')).toBeTruthy());
    expect(screen.getByText('The request could not be read right now.')).toBeTruthy();
    expect(screen.queryByText('This request is not in your list')).toBeNull();

    mockGetPaymentRequest.mockResolvedValueOnce(request());
    await act(async () => {
      fireEvent.press(screen.getByText('Try again'));
    });

    await waitFor(() => expect(screen.getByText('Pay 5.00 USDC')).toBeTruthy());
    expect(screen.getByText('Decline')).toBeTruthy();
    expect(mockGetPaymentRequest).toHaveBeenCalledTimes(2);
  });

  it('keeps Pay on a paid request and says that paying again sends more', async () => {
    mockGetPaymentRequest.mockResolvedValueOnce(request({ status: 'paid', txHash: '0xabc' }));

    const screen = await renderScreen();

    await waitFor(() => expect(screen.getByText('Paid')).toBeTruthy());
    expect(screen.getByText('This request is already paid. Paying again sends another 5.00 USDC.')).toBeTruthy();
    expect(screen.getByText('Pay 5.00 USDC')).toBeTruthy();
    expect(screen.queryByText('Decline')).toBeNull();
  });

  it('keeps Pay on a declined request and says it can still be paid', async () => {
    mockGetPaymentRequest.mockResolvedValueOnce(request({ status: 'declined' }));

    const screen = await renderScreen();

    await waitFor(() => expect(screen.getByText('Declined')).toBeTruthy());
    expect(screen.getByText('You declined this request. You can still pay it.')).toBeTruthy();
    expect(screen.getByText('Pay 5.00 USDC')).toBeTruthy();
  });

  it('offers to add the missing USDC when the phone wallet holds too little, and Pay still reaches the wallet', async () => {
    phoneWalletHolds('1.5');
    mockGetPaymentRequest.mockResolvedValueOnce(request());

    const screen = await renderScreen();

    await waitFor(() => expect(screen.getByText('Add USDC to pay this')).toBeTruthy());
    expect(screen.getByText('Your phone wallet holds 1.50 USDC. This needs 5.00 USDC.')).toBeTruthy();

    fireEvent.press(screen.getByText('Add USDC to pay this'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/add-usdc', params: { amount: '3.50' } });

    await act(async () => {
      fireEvent.press(screen.getByText('Pay 5.00 USDC'));
    });
    expect(mockPreparePaymentRequest).toHaveBeenCalledTimes(1);
  });

  it('shows no offer when the phone wallet holds enough', async () => {
    phoneWalletHolds('5');
    mockGetPaymentRequest.mockResolvedValueOnce(request());

    const screen = await renderScreen();

    await waitFor(() => expect(screen.getByText('Pay 5.00 USDC')).toBeTruthy());
    expect(mockGetPortfolio).toHaveBeenCalled();
    expect(screen.queryByText('Add USDC to pay this')).toBeNull();
  });

  it('shows no offer when the phone wallet cannot be read, and Pay still reaches the wallet', async () => {
    mockGetPortfolio.mockRejectedValue(new Error('Base is not answering'));
    mockGetPaymentRequest.mockResolvedValueOnce(request());

    const screen = await renderScreen();

    await waitFor(() => expect(screen.getByText('Pay 5.00 USDC')).toBeTruthy());
    expect(screen.queryByText('Add USDC to pay this')).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByText('Pay 5.00 USDC'));
    });
    expect(mockPreparePaymentRequest).toHaveBeenCalledTimes(1);
  });

  it('sends a person without a phone wallet yet to add the requested USDC', async () => {
    mockSmartAccounts = [];
    mockGetPaymentRequest.mockResolvedValueOnce(request());

    const screen = await renderScreen();

    await waitFor(() => expect(screen.getByText('Add USDC')).toBeTruthy());
    expect(screen.queryByText('Pay 5.00 USDC')).toBeNull();
    fireEvent.press(screen.getByText('Add USDC'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/add-usdc', params: { amount: '5.00' } });
  });
});
