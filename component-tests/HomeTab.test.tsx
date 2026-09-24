import { act, fireEvent, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Linking } from 'react-native';

import HomeTab from '@/app/(tabs)/index';
import { renderThemed } from './helpers/renderThemed';

const PHONE_WALLET = '0xAbCdEf1111111111111111111111111111111111';
const REGENTS_BALANCE_WALLET = '0xDeF0222222222222222222222222222222222222';
const OLDER_WALLET = '0x3333333333333333333333333333333333333333';

const mockGetPortfolio = jest.fn();
const mockListAgents = jest.fn();
const mockListAuctions = jest.fn();
const mockFetchTechtree = jest.fn();
const mockRouter = { push: jest.fn() };
let mockLinkedAccounts: object[] = [];
let mockFocusCallback: (() => void) | null = null;

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void) => {
    mockFocusCallback = callback;
  },
  useRouter: () => mockRouter,
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('@coinbase/cdp-hooks', () => ({
  useCurrentUser: () => ({ currentUser: { evmSmartAccounts: [PHONE_WALLET] } }),
}));

jest.mock('@/hooks/useRegentsAuth', () => ({
  useRegentsAuth: () => ({ privyUser: { linked_accounts: mockLinkedAccounts } }),
}));

jest.mock('@/utils/regentApi/client', () => ({
  regentApi: {
    getPortfolio: (...args: unknown[]) => mockGetPortfolio(...args),
    listAgents: (...args: unknown[]) => mockListAgents(...args),
  },
}));

jest.mock('@/utils/autolaunch/client', () => ({
  listAutolaunchAuctions: (...args: unknown[]) => mockListAuctions(...args),
}));

jest.mock('@/utils/techtreeResults', () => ({
  fetchTechtreeResults: (...args: unknown[]) => mockFetchTechtree(...args),
}));

function holdings(wallet: string) {
  return wallet === REGENTS_BALANCE_WALLET
    ? {
        wallet_address: wallet,
        eth_balance: '0.5',
        usdc_balance: '1234.5',
        regent_balance: '77',
        staked_regent: '12',
        claimable_usdc: '0',
        claimable_regent: '0',
      }
    : {
        wallet_address: wallet,
        eth_balance: '0.0123456',
        usdc_balance: '42.5',
        regent_balance: '1000',
        staked_regent: '250',
        claimable_usdc: '1.25',
        claimable_regent: '3',
      };
}

async function renderHome() {
  const screen = renderThemed(<HomeTab />);
  await act(async () => {
    mockFocusCallback?.();
  });
  return screen;
}

describe('Home tab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFocusCallback = null;
    mockLinkedAccounts = [
      { type: 'wallet', chain_type: 'ethereum', address: OLDER_WALLET, latest_verified_at: 100 },
      { type: 'wallet', chain_type: 'ethereum', address: REGENTS_BALANCE_WALLET, latest_verified_at: 200 },
    ];
    mockGetPortfolio.mockImplementation(async ({ wallets }: { wallets: string[] }) => {
      if (wallets[0] === REGENTS_BALANCE_WALLET) {
        throw new Error('Base is not answering');
      }
      return { chain_id: 8453, block_number: 1, wallets: wallets.map(holdings) };
    });
    mockListAgents.mockResolvedValue({
      agents: [
        { id: 'a', name: 'Scout', kind: 'hermes', walletAddress: REGENTS_BALANCE_WALLET, paired: true, createdAt: '', usdcBalance: '10.25' },
        { id: 'b', name: 'Clerk', kind: 'muse', walletAddress: PHONE_WALLET, paired: false, createdAt: '', usdcBalance: '2.25' },
      ],
      balancesAvailable: true,
    });
    mockListAuctions.mockRejectedValue(new Error('Autolaunch is down'));
    mockFetchTechtree.mockResolvedValue({
      cards: [{ id: '9', skillName: 'Protein folding', climbName: 'Bio climb', date: 'Sep 22, 2026' }],
      nextBeforeSequence: null,
    });
  });

  it('shows every card that loaded and a plain line on each one that did not', async () => {
    const screen = await renderHome();

    await waitFor(() => expect(screen.getByText('Protein folding')).toBeTruthy());

    // Phone wallet: token amounts and the staking position.
    expect(mockGetPortfolio).toHaveBeenCalledWith({ wallets: [PHONE_WALLET] });
    expect(screen.getByText('42.5')).toBeTruthy();
    expect(screen.getByText('0.0123')).toBeTruthy();
    expect(screen.getByText('250')).toBeTruthy();
    expect(screen.getByText('Open Earn')).toBeTruthy();

    // The Regents Balance failed on its own, with the view-only line still shown.
    expect(mockGetPortfolio).toHaveBeenCalledWith({ wallets: [REGENTS_BALANCE_WALLET] });
    expect(screen.getByText('View only here. Add to it from Fund.')).toBeTruthy();
    expect(screen.getByText("Your Regents Balance isn't available right now.")).toBeTruthy();

    // Agents loaded; Autolaunch failed; Techtree loaded.
    expect(screen.getByText('2 agents')).toBeTruthy();
    expect(screen.getByText('12.50 USDC in total')).toBeTruthy();
    expect(screen.getByText("Auctions aren't available right now.")).toBeTruthy();
    expect(screen.getByText('Bio climb · Sep 22, 2026')).toBeTruthy();
  });

  it('offers Try again on a card that did not load and reads only that card again', async () => {
    const screen = await renderHome();

    await waitFor(() => expect(screen.getByText("Auctions aren't available right now.")).toBeTruthy());
    // The Regents Balance and Autolaunch failed, in page order.
    const retries = screen.getAllByText('Try again');
    expect(retries).toHaveLength(2);

    mockListAuctions.mockResolvedValue([{ state: 'active' }]);
    await act(async () => {
      fireEvent.press(retries[1]);
    });

    await waitFor(() => expect(screen.getByText('1 auction is open now.')).toBeTruthy());
    expect(mockListAuctions).toHaveBeenCalledTimes(2);
    expect(mockListAgents).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText('Try again')).toHaveLength(1);
  });

  it('shows the Regents Balance with its USDC first and sends Add to Regents Balance to Fund', async () => {
    mockGetPortfolio.mockImplementation(async ({ wallets }: { wallets: string[] }) => ({
      chain_id: 8453,
      block_number: 1,
      wallets: wallets.map(holdings),
    }));

    const screen = await renderHome();

    await waitFor(() => expect(screen.getByText('1,234.50 USDC')).toBeTruthy());
    expect(mockGetPortfolio).toHaveBeenCalledWith({ wallets: [REGENTS_BALANCE_WALLET] });
    expect(mockGetPortfolio).not.toHaveBeenCalledWith({ wallets: [OLDER_WALLET] });
    expect(screen.getByText('77')).toBeTruthy();
    expect(screen.getByText('View only here. Add to it from Fund.')).toBeTruthy();

    fireEvent.press(screen.getByText('Add to Regents Balance'));
    expect(mockRouter.push).toHaveBeenCalledWith('/wallet');
  });

  it('asks the person to sign in on regents.sh when there is no Regents Balance, without reading one', async () => {
    mockLinkedAccounts = [
      { type: 'wallet', chain_type: 'ethereum', address: PHONE_WALLET.toLowerCase(), latest_verified_at: 300 },
    ];
    mockListAuctions.mockResolvedValue([{ state: 'active' }, { state: 'graduated' }]);
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);

    const screen = await renderHome();

    await waitFor(() => expect(screen.getByText('1 auction is open now.')).toBeTruthy());
    expect(screen.getByText('Sign in on regents.sh with a wallet to set up your Regents Balance.')).toBeTruthy();
    expect(screen.queryByText('Add to Regents Balance')).toBeNull();
    expect(mockGetPortfolio).toHaveBeenCalledTimes(1);
    expect(mockGetPortfolio).toHaveBeenCalledWith({ wallets: [PHONE_WALLET] });

    fireEvent.press(screen.getByText('Open regents.sh'));
    expect(openURL).toHaveBeenCalledWith('https://regents.sh');
  });
});
