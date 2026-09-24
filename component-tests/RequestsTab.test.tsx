import { act, fireEvent, waitFor } from '@testing-library/react-native';
import React from 'react';

import RequestsTab from '@/app/(tabs)/requests';
import { renderThemed } from './helpers/renderThemed';

const mockListPaymentRequests = jest.fn();
let mockFocusCallback: (() => void) | null = null;

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void) => {
    mockFocusCallback = callback;
  },
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('@/utils/regentApi/client', () => ({
  regentApi: {
    listPaymentRequests: (...args: unknown[]) => mockListPaymentRequests(...args),
  },
}));

const WALLET = '0x1111222233334444555566667777888899990001';

describe('Requests tab', () => {
  it('says the list could not be read, without claiming there are no requests, and tries again', async () => {
    mockListPaymentRequests.mockRejectedValueOnce(new Error('Base is not answering'));

    const screen = renderThemed(<RequestsTab />);
    await act(async () => {
      mockFocusCallback?.();
    });

    await waitFor(() => expect(screen.getByText('Try again')).toBeTruthy());
    expect(screen.queryByText(/No requests yet/)).toBeNull();

    mockListPaymentRequests.mockResolvedValueOnce({
      requests: [
        {
          id: 'req-1',
          agentId: 'agent-1',
          agentName: 'Muse',
          agentWallet: WALLET,
          to: WALLET,
          amount: '12.50',
          amountRaw: '12500000',
          note: 'GPU time',
          createdAt: new Date().toISOString(),
          status: 'declined',
          txHash: null,
        },
      ],
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Try again'));
    });

    await waitFor(() => expect(screen.getByText('12.50 USDC')).toBeTruthy());
    expect(screen.queryByText('Try again')).toBeNull();
    expect(screen.getByText('Declined')).toBeTruthy();
    expect(mockListPaymentRequests).toHaveBeenCalledTimes(2);
  });
});
