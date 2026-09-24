import { act, fireEvent } from '@testing-library/react-native';
import React from 'react';
import { Linking } from 'react-native';

import WalletScreen from '@/app/(tabs)/wallet';
import { renderThemed } from './helpers/renderThemed';

const REGENTS_BALANCE_WALLET = '0xDeF0222222222222222222222222222222222222';

let mockRegentsBalanceWallet: string | null = null;

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('@/hooks/useRegentsBalanceWallet', () => ({
  useRegentsBalanceWallet: () => mockRegentsBalanceWallet,
}));

jest.mock('@/hooks/wallet/useWalletDetailsState', () => ({
  useWalletDetailsState: () => ({ loadingBalances: false, refreshWalletSnapshot: jest.fn() }),
}));

jest.mock('@/components/agents/AgentFundHero', () => ({ AgentFundHero: () => null }));
jest.mock('@/components/wallet/home/wallet-screen-header', () => ({ WalletScreenHeader: () => null }));
jest.mock('@/components/wallet/WalletDetailsSection', () => ({ WalletDetailsSection: () => null }));

jest.mock('@/components/onramp/AddUsdc', () => {
  const { Text: MockText } = jest.requireActual('react-native');
  return {
    AddUsdc: ({ destinationAddress, destinationLabel }: { destinationAddress: string; destinationLabel: string }) => (
      <MockText>{`Buying for ${destinationLabel} at ${destinationAddress}`}</MockText>
    ),
  };
});

async function renderFund() {
  const screen = renderThemed(<WalletScreen />);
  // Let the icon font finish loading.
  await act(async () => {});
  return screen;
}

describe('Fund tab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('adds only to the Regents Balance', async () => {
    mockRegentsBalanceWallet = REGENTS_BALANCE_WALLET;

    const screen = await renderFund();

    expect(screen.getByText(`Buying for your Regents Balance at ${REGENTS_BALANCE_WALLET}`)).toBeTruthy();
    expect(screen.getByText('Pick an amount, choose Apple Pay when available, and review before USDC is added.')).toBeTruthy();
    expect(screen.queryByText('Sign in on regents.sh with a wallet to set up your Regents Balance.')).toBeNull();
  });

  it('replaces the purchase form with the sign-in notice when there is no Regents Balance', async () => {
    mockRegentsBalanceWallet = null;
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);

    const screen = await renderFund();

    expect(screen.getByText('Sign in on regents.sh with a wallet to set up your Regents Balance.')).toBeTruthy();
    expect(screen.queryByText(/^Buying for/)).toBeNull();
    expect(screen.queryByText('Pick an amount, choose Apple Pay when available, and review before USDC is added.')).toBeNull();

    fireEvent.press(screen.getByText('Open regents.sh'));
    expect(openURL).toHaveBeenCalledWith('https://regents.sh');
  });
});
