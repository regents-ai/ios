import { useCurrentUser, useEvmAddress, useSolanaAddress } from '@coinbase/cdp-hooks';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getBaseUrl } from '@/constants/BASE_URL';
import { runRegentHaptic } from '@/components/ui/haptics';
import { useRegentsAuth } from '@/hooks/useRegentsAuth';
import { createLatestRequestGate, type LatestRequestGate } from '@/utils/async/latestRequestGate';
import { authenticatedFetch } from '@/utils/authenticatedFetch';
import { createOfframpSession } from '@/utils/createOfframpSession';
import { setPendingOfframpBalance } from '@/utils/state/flowRuntimeState';
import { setCurrentSolanaAddress, setCurrentWalletAddress } from '@/utils/state/walletRuntimeState';
import { consumeWalletRefreshRequest, subscribeWalletRefresh } from '@/utils/walletRefresh';

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

async function fetchNetworkBalances(url: string, network: string): Promise<BalanceRecord[]> {
  const data = await fetchAuthorizedJson(url);
  const balances = Array.isArray(data.balances) ? data.balances : [];

  return balances.map((balance: BalanceRecord) => ({ ...balance, network }));
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
  const balancesRequestGateRef = useRef<LatestRequestGate | null>(null);
  if (balancesRequestGateRef.current === null) {
    balancesRequestGateRef.current = createLatestRequestGate();
  }
  const balancesRequestGate = balancesRequestGateRef.current;
  const testnetBalancesRequestGateRef = useRef<LatestRequestGate | null>(null);
  if (testnetBalancesRequestGateRef.current === null) {
    testnetBalancesRequestGateRef.current = createLatestRequestGate();
  }
  const testnetBalancesRequestGate = testnetBalancesRequestGateRef.current;

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

    const requestId = balancesRequestGate.next();
    const isLatestRequest = () => balancesRequestGate.isLatest(requestId);
    setLoadingBalances(true);
    setBalancesError(null);

    try {
      const balanceRequests: Promise<BalanceRecord[]>[] = [];

      if (primaryAddress) {
        balanceRequests.push(
          fetchNetworkBalances(`${getBaseUrl()}/balances/evm?address=${primaryAddress}&network=base`, 'Base'),
          fetchNetworkBalances(`${getBaseUrl()}/balances/evm?address=${primaryAddress}&network=ethereum`, 'Ethereum')
        );
      }

      if (solanaAddress) {
        balanceRequests.push(fetchNetworkBalances(`${getBaseUrl()}/balances/solana?address=${solanaAddress}`, 'Solana'));
      }

      const allBalances = (await Promise.all(balanceRequests)).flat();
      if (!isLatestRequest()) {
        return;
      }
      setBalances(allBalances);
    } catch (error) {
      if (!isLatestRequest()) {
        return;
      }
      console.warn('Failed to load wallet balances:', error);
      setBalancesError('Unable to load your balances right now.');
    } finally {
      if (isLatestRequest()) {
        setLoadingBalances(false);
      }
    }
  }, [balancesRequestGate, primaryAddress, solanaAddress]);

  const fetchTestnetBalances = useCallback(async () => {
    if (!primaryAddress && !solanaAddress) {
      return;
    }

    const requestId = testnetBalancesRequestGate.next();
    const isLatestRequest = () => testnetBalancesRequestGate.isLatest(requestId);
    setLoadingTestnetBalances(true);
    setTestnetBalancesError(null);

    try {
      const balanceRequests: Promise<BalanceRecord[]>[] = [];

      if (primaryAddress) {
        balanceRequests.push(
          fetchNetworkBalances(`${getBaseUrl()}/balances/evm?address=${primaryAddress}&network=base-sepolia`, 'Base Sepolia'),
          fetchNetworkBalances(`${getBaseUrl()}/balances/evm?address=${primaryAddress}&network=ethereum-sepolia`, 'Ethereum Sepolia')
        );
      }

      if (solanaAddress) {
        balanceRequests.push(fetchNetworkBalances(`${getBaseUrl()}/balances/solana?address=${solanaAddress}&network=solana-devnet`, 'Solana Devnet'));
      }

      const allBalances = (await Promise.all(balanceRequests)).flat();
      if (!isLatestRequest()) {
        return;
      }
      setTestnetBalances(allBalances);
    } catch (error) {
      if (!isLatestRequest()) {
        return;
      }
      console.warn('Failed to load testnet balances:', error);
      setTestnetBalancesError('Unable to load testnet balances right now.');
    } finally {
      if (isLatestRequest()) {
        setLoadingTestnetBalances(false);
      }
    }
  }, [primaryAddress, solanaAddress, testnetBalancesRequestGate]);

  useEffect(() => {
    if (primaryAddress || solanaAddress) {
      void fetchBalances();
      void fetchTestnetBalances();
    } else {
      balancesRequestGate.next();
      testnetBalancesRequestGate.next();
      setBalances([]);
      setTestnetBalances([]);
      setBalancesError(null);
      setTestnetBalancesError(null);
      setLoadingBalances(false);
      setLoadingTestnetBalances(false);
    }
  }, [balancesRequestGate, fetchBalances, fetchTestnetBalances, primaryAddress, solanaAddress, testnetBalancesRequestGate]);

  useFocusEffect(
    useCallback(() => {
      if (primaryAddress || solanaAddress) {
        void fetchBalances();
        void fetchTestnetBalances();
      }
    }, [fetchBalances, fetchTestnetBalances, primaryAddress, solanaAddress])
  );

  // Out-of-band refresh requests (e.g. tapping an onramp push notification)
  // land in the wallet-refresh bridge; drain them here so balances update even
  // when the wallet screen is already focused.
  useEffect(() => {
    const drainRefreshRequest = () => {
      if (consumeWalletRefreshRequest() && (primaryAddress || solanaAddress)) {
        void fetchBalances();
        void fetchTestnetBalances();
      }
    };

    drainRefreshRequest();
    return subscribeWalletRefresh(drainRefreshRequest);
  }, [fetchBalances, fetchTestnetBalances, primaryAddress, solanaAddress]);

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
    if (type === 'success') {
      runRegentHaptic('success');
    } else if (type === 'error') {
      runRegentHaptic('warning');
    }

    setAlertState({ visible: true, title, message, type });
  }, []);

  const copyAddress = useCallback(
    async (addressToCopy: string, label: string, key: string) => {
      try {
        await Clipboard.setStringAsync(addressToCopy);
        runRegentHaptic('copy');
        setRecentCopyKey(key);
        setTimeout(() => setRecentCopyKey((current) => (current === key ? null : current)), 1400);
      } catch {
        showAlert('Copy failed', `Unable to copy your ${label.toLowerCase()}.`, 'error');
      }
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
