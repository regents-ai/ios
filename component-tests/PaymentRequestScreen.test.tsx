import { act, fireEvent, waitFor } from '@testing-library/react-native';
import React from 'react';

import PaymentRequestScreen from '@/app/request/[id]';
import type { PaymentRequest } from '@/types/regents';
import { ApiError } from '@/utils/apiError';
import { renderThemed } from './helpers/renderThemed';

const mockGetPaymentRequest = jest.fn();
let mockFocusCallback: (() => void) | null = null;

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void) => {
    mockFocusCallback = callback;
  },
  useLocalSearchParams: () => ({ id: 'req-1' }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), setParams: jest.fn() }),
}));

jest.mock('@coinbase/cdp-hooks', () => ({
  useCurrentUser: () => ({ currentUser: { evmSmartAccounts: ['0xAbCdEf1111111111111111111111111111111111'] } }),
  useSendUserOperation: () => ({ sendUserOperation: jest.fn(), status: 'idle', data: undefined, error: undefined }),
  useGetAccessToken: () => ({ getAccessToken: jest.fn() }),
}));

jest.mock('@/utils/regentApi/client', () => ({
  regentApi: {
    getPaymentRequest: (...args: unknown[]) => mockGetPaymentRequest(...args),
  },
}));

const WALLET = '0x1111222233334444555566667777888899990001';

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
});
