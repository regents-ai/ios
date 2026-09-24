import { act, fireEvent, waitFor } from '@testing-library/react-native';
import React from 'react';

import EarnTab from '@/app/(tabs)/earn';
import { ApiError } from '@/utils/apiError';
import { renderThemed } from './helpers/renderThemed';

const mockGetRegentStaking = jest.fn();
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

jest.mock('@coinbase/cdp-hooks', () => ({
  useCurrentUser: () => ({ currentUser: { evmSmartAccounts: ['0xAbCdEf1111111111111111111111111111111111'] } }),
  useSendUserOperation: () => ({ sendUserOperation: jest.fn() }),
}));

jest.mock('@/utils/onchain/stakingWalletAction', () => ({
  needsStakingApproval: jest.fn(),
  stakingActionCall: jest.fn(),
  stakingApprovalCall: jest.fn(),
  stakingNetworkForChain: jest.fn(),
}));

jest.mock('@/utils/regentApi/client', () => ({
  regentApi: {
    getRegentStaking: (...args: unknown[]) => mockGetRegentStaking(...args),
  },
}));

describe('Earn tab', () => {
  it('shows no made-up zeros when staking cannot be read, keeps the actions, and tries again', async () => {
    mockGetRegentStaking.mockRejectedValueOnce(
      new ApiError('server', "Staking couldn't be read from Base right now. Please try again in a moment.", 503),
    );

    const screen = renderThemed(<EarnTab />);
    await act(async () => {
      mockFocusCallback?.();
    });

    await waitFor(() => expect(screen.getByText('Staking numbers are not available')).toBeTruthy());
    expect(screen.getByText("Staking couldn't be read from Base right now. Please try again in a moment.")).toBeTruthy();
    expect(screen.queryByText('Total staked')).toBeNull();
    expect(screen.queryByText('0 REGENT')).toBeNull();
    expect(screen.getByText('Stake')).toBeTruthy();
    expect(screen.getByText('Claim USDC')).toBeTruthy();

    mockGetRegentStaking.mockResolvedValueOnce({
      paused: false,
      total_staked: '48213377',
      wallet_stake_balance: '120000',
      wallet_token_balance: '25000',
      wallet_claimable_usdc: '3.4172',
      wallet_claimable_regent: '812.55',
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Try again'));
    });

    await waitFor(() => expect(screen.getByText('Total staked')).toBeTruthy());
    expect(screen.queryByText('Staking numbers are not available')).toBeNull();
    expect(screen.getByText('120000 REGENT')).toBeTruthy();
  });
});
