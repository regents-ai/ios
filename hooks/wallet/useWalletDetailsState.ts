import { useCurrentUser, useEvmAddress, useSolanaAddress } from '@coinbase/cdp-hooks';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { getBaseUrl } from '@/constants/BASE_URL';
import { useRegentsAuth } from '@/hooks/useRegentsAuth';
import { authenticatedFetch } from '@/utils/authenticatedFetch';
import { createOfframpSession } from '@/utils/createOfframpSession';
import { setPendingOfframpBalance } from '@/utils/state/flowRuntimeState';
import { setCurrentSolanaAddress, setCurrentWalletAddress } from '@/utils/state/walletRuntimeState';

export type BalanceRecord = {
  network: string;
  token?: {
    symbol?: string;
    name?: string;
    contractAddress?: string;
    mintAddress?: string;
  };
  amount?: {
    amount?: string;
    decimals?: string;
  };
  usdValue?: number;
};

async function fetchAuthorizedJson(url: string) {
  const response = await authenticatedFetch(url);
  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`);
  }
  return response.json();
}

export function useWalletDetailsState() {
  const router = useRouter();
  const { regentsUserId } = useRegentsAuth();
  const { currentUser } = useCurrentUser();
  const { evmAddress } = useEvmAddress();
  const { solanaAddress: cdpSolanaAddress } = useSolanaAddress();

  const explicitEOAAddress = (currentUser?.evmAccounts?.[0] as string | undefined) ?? undefined;
  const smartAccountAddress = (currentUser?.evmSmartAccounts?.[0] as string | undefined) ?? undefined;
  const solanaAddress = cdpSolanaAddress;
  const primaryAddress = smartAccountAddress || explicitEOAAddress || evmAddress || null;
  const userId = regentsUserId;
  const isExpoGo = process.env.EXPO_PUBLIC_USE_EXPO_CRYPTO === 'true';

  const [balances, setBalances] = useState<BalanceRecord[]>([]);
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [balancesError, setBalancesError] = useState<string | null>(null);
  const [balancesExpanded, setBalancesExpanded] = useState(true);

  const [testnetBalances, setTestnetBalances] = useState<BalanceRecord[]>([]);
  const [loadingTestnetBalances, setLoadingTestnetBalances] = useState(false);
  const [testnetBalancesError, setTestnetBalancesError] = useState<string | null>(null);
  const [testnetExpanded, setTestnetExpanded] = useState(false);
  const [recentCopyKey, setRecentCopyKey] = useState<string | null>(null);

  const [alertState, setAlertState] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type: 'success' | 'error' | 'info';
  }>({
    visible: false,
    title: '',
    message: '',
    type: 'info',
  });

  useEffect(() => {
    setCurrentWalletAddress(primaryAddress ?? null);
    setCurrentSolanaAddress(solanaAddress ?? null);
  }, [primaryAddress, solanaAddress]);

  const fetchBalances = useCallback(async () => {
    if (!primaryAddress && !solanaAddress) {
      return;
    }

    setLoadingBalances(true);
    setBalancesError(null);

    try {
      const allBalances: BalanceRecord[] = [];

      if (primaryAddress) {
        const baseData = await fetchAuthorizedJson(`${getBaseUrl()}/balances/evm?address=${primaryAddress}&network=base`);
        allBalances.push(...(baseData.balances || []).map((balance: BalanceRecord) => ({ ...balance, network: 'Base' })));

        const ethereumData = await fetchAuthorizedJson(`${getBaseUrl()}/balances/evm?address=${primaryAddress}&network=ethereum`);
        allBalances.push(...(ethereumData.balances || []).map((balance: BalanceRecord) => ({ ...balance, network: 'Ethereum' })));
      }

      if (solanaAddress) {
        const solanaData = await fetchAuthorizedJson(`${getBaseUrl()}/balances/solana?address=${solanaAddress}`);
        allBalances.push(...(solanaData.balances || []).map((balance: BalanceRecord) => ({ ...balance, network: 'Solana' })));
      }

      setBalances(allBalances);
    } catch (error) {
      console.warn('Failed to load wallet balances:', error);
      setBalancesError('Unable to load your balances right now.');
    } finally {
      setLoadingBalances(false);
    }
  }, [primaryAddress, solanaAddress]);

  const fetchTestnetBalances = useCallback(async () => {
    if (!primaryAddress && !solanaAddress) {
      return;
    }

    setLoadingTestnetBalances(true);
    setTestnetBalancesError(null);

    try {
      const allBalances: BalanceRecord[] = [];

      if (primaryAddress) {
        const baseSepoliaData = await fetchAuthorizedJson(`${getBaseUrl()}/balances/evm?address=${primaryAddress}&network=base-sepolia`);
        allBalances.push(...(baseSepoliaData.balances || []).map((balance: BalanceRecord) => ({ ...balance, network: 'Base Sepolia' })));

        const ethereumSepoliaData = await fetchAuthorizedJson(`${getBaseUrl()}/balances/evm?address=${primaryAddress}&network=ethereum-sepolia`);
        allBalances.push(...(ethereumSepoliaData.balances || []).map((balance: BalanceRecord) => ({ ...balance, network: 'Ethereum Sepolia' })));
      }

      if (solanaAddress) {
        const solanaDevnetData = await fetchAuthorizedJson(`${getBaseUrl()}/balances/solana?address=${solanaAddress}&network=solana-devnet`);
        allBalances.push(...(solanaDevnetData.balances || []).map((balance: BalanceRecord) => ({ ...balance, network: 'Solana Devnet' })));
      }

      setTestnetBalances(allBalances);
    } catch (error) {
      console.warn('Failed to load testnet balances:', error);
      setTestnetBalancesError('Unable to load testnet balances right now.');
    } finally {
      setLoadingTestnetBalances(false);
    }
  }, [primaryAddress, solanaAddress]);

  useEffect(() => {
    if (primaryAddress || solanaAddress) {
      void fetchBalances();
      void fetchTestnetBalances();
    }
  }, [fetchBalances, fetchTestnetBalances, primaryAddress, solanaAddress]);

  useFocusEffect(
    useCallback(() => {
      if (primaryAddress || solanaAddress) {
        void fetchBalances();
        void fetchTestnetBalances();
      }
    }, [fetchBalances, fetchTestnetBalances, primaryAddress, solanaAddress])
  );

  const groupedMainnetBalances = useMemo(
    () =>
      ['Base', 'Ethereum', 'Solana'].map((network) => ({
        network,
        balances: balances.filter((balance) => balance.network === network),
      })),
    [balances]
  );

  const groupedTestnetBalances = useMemo(
    () =>
      ['Base Sepolia', 'Ethereum Sepolia', 'Solana Devnet'].map((network) => ({
        network,
        balances: testnetBalances.filter((balance) => balance.network === network),
      })),
    [testnetBalances]
  );

  const featuredBaseUsdc = useMemo(
    () => balances.find((balance) => balance.network === 'Base' && balance.token?.symbol?.toUpperCase() === 'USDC') || null,
    [balances]
  );

  const walletUsdTotal = useMemo(
    () => balances.reduce((sum, balance) => sum + (typeof balance.usdValue === 'number' ? balance.usdValue : 0), 0),
    [balances]
  );

  const hasAnyWalletBalance = balances.length > 0;

  const showAlert = useCallback((title: string, message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setAlertState({ visible: true, title, message, type });
  }, []);

  const copyAddress = useCallback(
    async (addressToCopy: string, label: string, key: string) => {
      await Clipboard.setStringAsync(addressToCopy);
      setRecentCopyKey(key);
      showAlert('Address copied', `${label} copied to the clipboard.`, 'info');
      setTimeout(() => setRecentCopyKey((current) => (current === key ? null : current)), 1400);
    },
    [showAlert]
  );

  const refreshWalletSnapshot = useCallback(async () => {
    await Promise.all([fetchBalances(), fetchTestnetBalances()]);
  }, [fetchBalances, fetchTestnetBalances]);

  const handleTransfer = useCallback(
    (balance: BalanceRecord, network: string) => {
      if (isExpoGo) {
        showAlert('Transfer unavailable', 'Open the installed app to send funds.', 'info');
        return;
      }

      router.push({
        pathname: '/wallet/send',
        params: {
          token: JSON.stringify(balance),
          network: network.toLowerCase().replace(/\s+/g, '-'),
        },
      });
    },
    [isExpoGo, router, showAlert]
  );

  const handleCashOut = useCallback(
    async (balance: BalanceRecord, network: string) => {
      if (isExpoGo) {
        showAlert('Cash out unavailable', 'Open the installed app to cash out.', 'info');
        return;
      }

      try {
        if (!userId) {
          throw new Error('You need to sign in before cashing out.');
        }

        const symbol = balance.token?.symbol || 'USDC';
        const isSolanaNetwork = network.toLowerCase() === 'solana';
        const address = isSolanaNetwork ? solanaAddress : primaryAddress;

        if (!address) {
          throw new Error('No wallet address was found for this network.');
        }

        setPendingOfframpBalance(balance);
        const url = await createOfframpSession({
          address,
          network,
          asset: symbol,
          userId,
        });

        const result = await WebBrowser.openAuthSessionAsync(url, 'regentsmobile://');
        if (result.type === 'success' && result.url) {
          const redirected = new URL(result.url);
          const partnerUserRef = redirected.searchParams.get('partnerUserRef') || userId;
          router.push({
            pathname: '/offramp-send',
            params: { partnerUserRef },
          });
        }
      } catch (error: any) {
        showAlert('Cash out failed', error.message || 'Unable to start cash out right now.', 'error');
      }
    },
    [isExpoGo, primaryAddress, router, showAlert, solanaAddress, userId]
  );

  const handlePrimarySend = useCallback(() => {
    if (!featuredBaseUsdc) {
      showAlert('Base USDC not ready', 'Add USDC on Base first, then you can send it from here.', 'info');
      return;
    }

    handleTransfer(featuredBaseUsdc, 'Base');
  }, [featuredBaseUsdc, handleTransfer, showAlert]);

  const handlePrimaryCashOut = useCallback(() => {
    if (!featuredBaseUsdc) {
      showAlert('Base USDC not ready', 'Add USDC on Base first, then you can cash it out from here.', 'info');
      return;
    }

    void handleCashOut(featuredBaseUsdc, 'Base');
  }, [featuredBaseUsdc, handleCashOut, showAlert]);

  return {
    primaryAddress,
    solanaAddress,
    balances,
    loadingBalances,
    balancesError,
    balancesExpanded,
    setBalancesExpanded,
    testnetBalances,
    loadingTestnetBalances,
    testnetBalancesError,
    testnetExpanded,
    setTestnetExpanded,
    recentCopyKey,
    alertState,
    setAlertState,
    groupedMainnetBalances,
    groupedTestnetBalances,
    featuredBaseUsdc,
    walletUsdTotal,
    hasAnyWalletBalance,
    copyAddress,
    refreshWalletSnapshot,
    handleTransfer,
    handleCashOut,
    handlePrimarySend,
    handlePrimaryCashOut,
    fetchBalances,
    fetchTestnetBalances,
    isExpoGo,
  };
}
