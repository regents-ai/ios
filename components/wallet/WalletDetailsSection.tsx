import { CoinbaseAlert } from '@/components/ui/CoinbaseAlerts';
import { getBaseUrl } from '@/constants/BASE_URL';
import { COLORS } from '@/constants/Colors';
import { TEST_ACCOUNTS } from '@/constants/TestAccounts';
import { FONTS } from '@/constants/Typography';
import { useRegentsAuth } from '@/hooks/useRegentsAuth';
import { authenticatedFetch } from '@/utils/authenticatedFetch';
import { createOfframpSession } from '@/utils/createOfframpSession';
import {
  getTestWalletSol,
  isTestSessionActive,
  setCurrentSolanaAddress,
  setCurrentWalletAddress,
  setPendingOfframpBalance,
} from '@/utils/sharedState';
import { useCurrentUser, useEvmAddress, useSolanaAddress } from '@coinbase/cdp-hooks';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';

const { CARD_BG, CARD_ALT, TEXT_PRIMARY, TEXT_SECONDARY, BLUE, BORDER, WHITE, VIOLET, DANGER, BLUE_WASH } = COLORS;

type BalanceRecord = {
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

function formatAddress(address: string) {
  if (address.length <= 14) return address;
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

function toNetworkSlug(network: string) {
  return network.toLowerCase().replace(/\s+/g, '-');
}

function getActualTokenAmount(balance: BalanceRecord) {
  const rawAmount = parseFloat(balance.amount?.amount || '0');
  const decimals = parseInt(balance.amount?.decimals || '0', 10);
  return rawAmount / Math.pow(10, decimals || 1);
}

function formatTokenAmount(balance: BalanceRecord) {
  const amount = getActualTokenAmount(balance);
  if (amount >= 1000) return amount.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (amount >= 1) return amount.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return amount.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function formatUsdValue(usdValue?: number) {
  if (typeof usdValue !== 'number') return 'Price unavailable';
  if (usdValue >= 1000) {
    return usdValue.toLocaleString(undefined, {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    });
  }
  return usdValue.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  });
}

async function fetchAuthorizedJson(url: string) {
  const response = await authenticatedFetch(url);
  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`);
  }
  return response.json();
}

export function WalletDetailsSection() {
  const router = useRouter();
  const testSession = isTestSessionActive();
  const { regentsUserId } = useRegentsAuth();
  const { currentUser } = useCurrentUser();
  const { evmAddress } = useEvmAddress();
  const { solanaAddress: cdpSolanaAddress } = useSolanaAddress();

  const explicitEOAAddress = testSession ? TEST_ACCOUNTS.wallets.eoaDummy : (currentUser?.evmAccounts?.[0] as string | undefined);
  const smartAccountAddress = testSession ? TEST_ACCOUNTS.wallets.evm : (currentUser?.evmSmartAccounts?.[0] as string | undefined);
  const solanaAddress = testSession ? getTestWalletSol() : cdpSolanaAddress;
  const primaryAddress = smartAccountAddress || explicitEOAAddress || evmAddress || null;
  const userId = testSession ? TEST_ACCOUNTS.userId : regentsUserId;

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

  const isExpoGo = process.env.EXPO_PUBLIC_USE_EXPO_CRYPTO === 'true';

  useEffect(() => {
    setCurrentWalletAddress(primaryAddress ?? null);
    setCurrentSolanaAddress(solanaAddress ?? null);
  }, [primaryAddress, solanaAddress]);

  const fetchBalances = useCallback(async () => {
    if (!primaryAddress && !solanaAddress) return;

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
      console.error('Failed to load wallet balances:', error);
      setBalancesError('Unable to load your balances right now.');
    } finally {
      setLoadingBalances(false);
    }
  }, [primaryAddress, solanaAddress]);

  const fetchTestnetBalances = useCallback(async () => {
    if (!primaryAddress && !solanaAddress) return;

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
      console.error('Failed to load testnet balances:', error);
      setTestnetBalancesError('Unable to load testnet balances right now.');
    } finally {
      setLoadingTestnetBalances(false);
    }
  }, [primaryAddress, solanaAddress]);

  useEffect(() => {
    if (primaryAddress || solanaAddress) {
      fetchBalances();
      fetchTestnetBalances();
    }
  }, [primaryAddress, solanaAddress, fetchBalances, fetchTestnetBalances]);

  useFocusEffect(
    useCallback(() => {
      if (primaryAddress || solanaAddress) {
        fetchBalances();
        fetchTestnetBalances();
      }
    }, [primaryAddress, solanaAddress, fetchBalances, fetchTestnetBalances])
  );

  const groupedMainnetBalances = useMemo(
    () => ['Base', 'Ethereum', 'Solana'].map(network => ({
      network,
      balances: balances.filter(balance => balance.network === network),
    })),
    [balances]
  );

  const groupedTestnetBalances = useMemo(
    () => ['Base Sepolia', 'Ethereum Sepolia', 'Solana Devnet'].map(network => ({
      network,
      balances: testnetBalances.filter(balance => balance.network === network),
    })),
    [testnetBalances]
  );

  const featuredBaseUsdc = useMemo(
    () =>
      balances.find(
        balance => balance.network === 'Base' && balance.token?.symbol?.toUpperCase() === 'USDC'
      ) || null,
    [balances]
  );

  const walletUsdTotal = useMemo(
    () =>
      balances.reduce((sum, balance) => sum + (typeof balance.usdValue === 'number' ? balance.usdValue : 0), 0),
    [balances]
  );

  const hasAnyWalletBalance = balances.length > 0;

  const showAlert = (title: string, message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setAlertState({ visible: true, title, message, type });
  };

  const copyAddress = async (address: string, label: string, key: string) => {
    await Clipboard.setStringAsync(address);
    setRecentCopyKey(key);
    showAlert('Address copied', `${label} copied to the clipboard.`, 'info');
    setTimeout(() => setRecentCopyKey(current => (current === key ? null : current)), 1400);
  };

  const refreshWalletSnapshot = async () => {
    await Promise.all([fetchBalances(), fetchTestnetBalances()]);
  };

  const handleTransfer = (balance: BalanceRecord, network: string) => {
    if (isExpoGo) {
      showAlert('Transfer unavailable', 'Open the installed app to send funds.', 'info');
      return;
    }

    router.push({
      pathname: '/wallet/send',
      params: {
        token: JSON.stringify(balance),
        network: toNetworkSlug(network),
      },
    });
  };

  const handleCashOut = async (balance: BalanceRecord, network: string) => {
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
  };

  const handlePrimarySend = () => {
    if (!featuredBaseUsdc) {
      showAlert('Base USDC not ready', 'Add USDC on Base first, then you can send it from here.', 'info');
      return;
    }

    handleTransfer(featuredBaseUsdc, 'Base');
  };

  const handlePrimaryCashOut = () => {
    if (!featuredBaseUsdc) {
      showAlert('Base USDC not ready', 'Add USDC on Base first, then you can cash it out from here.', 'info');
      return;
    }

    void handleCashOut(featuredBaseUsdc, 'Base');
  };

  const renderBalanceRow = (balance: BalanceRecord, network: string, cashOutEnabled: boolean) => {
    const symbol = balance.token?.symbol || 'UNKNOWN';

    return (
      <View
        key={`${network}-${balance.token?.contractAddress || balance.token?.mintAddress || symbol}`}
        style={[styles.balanceRow, network === 'Base' && styles.balanceRowFeatured]}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.balanceSymbol}>{symbol}</Text>
          {balance.token?.name ? <Text style={styles.balanceName}>{balance.token.name}</Text> : null}
        </View>

        <View style={styles.balanceRight}>
          <Text style={styles.balanceAmount}>{formatTokenAmount(balance)}</Text>
          <Text style={styles.balanceUsd}>{formatUsdValue(balance.usdValue)}</Text>
          <View style={styles.balanceActions}>
            <Pressable style={({ pressed }) => [styles.actionChip, pressed && styles.actionChipPressed]} onPress={() => handleTransfer(balance, network)}>
              <Text style={styles.actionChipText}>Send</Text>
            </Pressable>
            {cashOutEnabled ? (
              <Pressable
                style={({ pressed }) => [
                  styles.actionChip,
                  styles.cashOutChip,
                  pressed && styles.actionChipPressed,
                ]}
                onPress={() => handleCashOut(balance, network)}
              >
                <Text style={styles.actionChipText}>Cash out</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    );
  };

  const renderLoadingSkeleton = () => (
    <View style={styles.loadingShell}>
      {[0, 1, 2].map(index => (
        <View key={index} style={styles.loadingSkeletonRow}>
          <View style={styles.loadingSkeletonLeft}>
            <View style={[styles.skeletonBlock, styles.skeletonTitle]} />
            <View style={[styles.skeletonBlock, styles.skeletonLine]} />
          </View>
          <View style={styles.loadingSkeletonRight}>
            <View style={[styles.skeletonBlock, styles.skeletonValue]} />
            <View style={[styles.skeletonBlock, styles.skeletonLineShort]} />
          </View>
        </View>
      ))}
    </View>
  );

  return (
    <View style={styles.section}>
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.cardTitle}>Wallet actions</Text>
            <Text style={styles.cardHint}>Keep your main address, recent activity, and everyday actions in one place.</Text>
          </View>
          <Pressable onPress={() => router.push('/settings')} style={styles.iconButton}>
            <Ionicons name="settings-outline" size={18} color={TEXT_PRIMARY} />
          </Pressable>
        </View>

        <View style={styles.featuredCard}>
          <View style={styles.featuredTopRow}>
            <View style={styles.featuredCopy}>
              <Text style={styles.featuredEyebrow}>Base first</Text>
              <Text style={styles.featuredTitle}>USDC stays front and center.</Text>
            </View>
            <View style={styles.featuredBadge}>
              <Text style={styles.featuredBadgeText}>Primary route</Text>
            </View>
          </View>
          <Text style={styles.featuredBody}>
            Use Base for the quickest Regents path, then keep Ethereum and Solana nearby when you need them.
          </Text>
          <View style={styles.featuredStats}>
            <View style={styles.featuredStat}>
              <Text style={styles.featuredStatLabel}>Base USDC</Text>
              <Text style={styles.featuredStatValue}>
                {loadingBalances ? 'Updating…' : featuredBaseUsdc ? `${formatTokenAmount(featuredBaseUsdc)} USDC` : 'Add funds'}
              </Text>
            </View>
            <View style={styles.featuredStat}>
              <Text style={styles.featuredStatLabel}>Wallet total</Text>
              <Text style={styles.featuredStatValue}>
                {loadingBalances && !hasAnyWalletBalance ? 'Updating…' : formatUsdValue(walletUsdTotal)}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.quickActionGrid}>
          <Pressable
            style={({ pressed }) => [
              styles.quickActionButton,
              styles.quickActionPrimary,
              pressed && styles.quickActionPressed,
            ]}
            onPress={handlePrimarySend}
          >
            <Ionicons name="paper-plane-outline" size={18} color={WHITE} />
            <Text style={styles.quickActionPrimaryText}>Send</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.quickActionButton,
              styles.quickActionSecondary,
              pressed && styles.quickActionPressed,
            ]}
            onPress={handlePrimaryCashOut}
          >
            <Ionicons name="cash-outline" size={18} color={TEXT_PRIMARY} />
            <Text style={styles.quickActionText}>Cash out</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.quickActionButton,
              styles.quickActionSecondary,
              pressed && styles.quickActionPressed,
            ]}
            onPress={() => router.push('/wallet/history')}
          >
            <Ionicons name="time-outline" size={18} color={TEXT_PRIMARY} />
            <Text style={styles.quickActionText}>Activity</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.quickActionButton,
              styles.quickActionSecondary,
              pressed && styles.quickActionPressed,
            ]}
            onPress={() => void refreshWalletSnapshot()}
          >
            <Ionicons name="refresh-outline" size={18} color={TEXT_PRIMARY} />
            <Text style={styles.quickActionText}>Refresh</Text>
          </Pressable>
        </View>

        {primaryAddress ? (
          <View style={styles.addressBlock}>
            <Text style={styles.addressLabel}>Base and Ethereum address</Text>
            <Text style={styles.addressValue}>{formatAddress(primaryAddress)}</Text>
            <Pressable
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
              onPress={() => copyAddress(primaryAddress, 'Base and Ethereum address', 'base')}
            >
              <Text style={styles.secondaryButtonText}>
                {recentCopyKey === 'base' ? 'Copied' : 'Copy address'}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {solanaAddress ? (
          <View style={styles.addressBlock}>
            <Text style={styles.addressLabel}>Solana address</Text>
            <Text style={styles.addressValue}>{formatAddress(solanaAddress)}</Text>
            <Pressable
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
              onPress={() => copyAddress(solanaAddress, 'Solana address', 'solana')}
            >
              <Text style={styles.secondaryButtonText}>
                {recentCopyKey === 'solana' ? 'Copied' : 'Copy address'}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <View style={styles.card}>
        <Pressable style={styles.cardHeader} onPress={() => setBalancesExpanded(prev => !prev)}>
          <View>
            <Text style={styles.cardTitle}>Mainnet balances</Text>
            <Text style={styles.cardHint}>Base stays at the top, with send and cash-out actions close to each balance.</Text>
          </View>
          <Ionicons name={balancesExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={TEXT_SECONDARY} />
        </Pressable>

        {balancesExpanded ? (
          <>
            {loadingBalances ? (
              renderLoadingSkeleton()
            ) : null}

            {balancesError ? (
              <View style={styles.feedbackBlock}>
                <Text style={styles.errorText}>{balancesError}</Text>
                <Pressable style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]} onPress={fetchBalances}>
                  <Text style={styles.primaryButtonText}>Retry</Text>
                </Pressable>
              </View>
            ) : null}

            {!loadingBalances && !balancesError ? (
              groupedMainnetBalances.map(group => (
                <View key={group.network} style={styles.networkSection}>
                  <Text style={styles.networkTitle}>{group.network}</Text>
                  {group.balances.length === 0 ? (
                    <Text style={styles.emptyText}>No tokens yet.</Text>
                  ) : (
                    group.balances.map(balance => renderBalanceRow(balance, group.network, true))
                  )}
                </View>
              ))
            ) : null}
          </>
        ) : null}
      </View>

      <View style={styles.card}>
        <Pressable style={styles.cardHeader} onPress={() => setTestnetExpanded(prev => !prev)}>
          <View>
            <Text style={styles.cardTitle}>Testnet balances</Text>
            <Text style={styles.cardHint}>Base Sepolia, Ethereum Sepolia, and Solana Devnet balances.</Text>
          </View>
          <Ionicons name={testnetExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={TEXT_SECONDARY} />
        </Pressable>

        {testnetExpanded ? (
          <>
            {loadingTestnetBalances ? (
              renderLoadingSkeleton()
            ) : null}

            {testnetBalancesError ? (
              <View style={styles.feedbackBlock}>
                <Text style={styles.errorText}>{testnetBalancesError}</Text>
                <Pressable style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]} onPress={fetchTestnetBalances}>
                  <Text style={styles.primaryButtonText}>Retry</Text>
                </Pressable>
              </View>
            ) : null}

            {!loadingTestnetBalances && !testnetBalancesError ? (
              groupedTestnetBalances.map(group => (
                <View key={group.network} style={styles.networkSection}>
                  <View style={styles.networkHeader}>
                    <Text style={styles.networkTitle}>{group.network}</Text>
                    <Pressable
                      style={styles.faucetButton}
                      onPress={() => {
                        const address = group.network.includes('Solana') ? solanaAddress : primaryAddress;
                        if (!address) return;
                        const network = toNetworkSlug(group.network);
                        Linking.openURL(`https://portal.cdp.coinbase.com/products/faucet?address=${address}&network=${network}`);
                      }}
                    >
                      <Ionicons name="water-outline" size={18} color={VIOLET} />
                    </Pressable>
                  </View>
                  {group.balances.length === 0 ? (
                    <Text style={styles.emptyText}>No testnet tokens yet.</Text>
                  ) : (
                    group.balances.map(balance => renderBalanceRow(balance, group.network, false))
                  )}
                </View>
              ))
            ) : null}
          </>
        ) : null}
      </View>

      <CoinbaseAlert
        visible={alertState.visible}
        title={alertState.title}
        message={alertState.message}
        type={alertState.type}
        onConfirm={() => setAlertState(prev => ({ ...prev, visible: false }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 16,
    marginTop: 16,
  },
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 18,
    gap: 16,
    shadowColor: BLUE,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
  },
  cardTitle: {
    color: BLUE,
    fontSize: 18,
    fontFamily: FONTS.heading,
  },
  cardHint: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
    maxWidth: 260,
    fontFamily: FONTS.body,
  },
  featuredCard: {
    backgroundColor: BLUE_WASH,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    gap: 12,
  },
  featuredTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  featuredCopy: {
    flex: 1,
    gap: 4,
  },
  featuredEyebrow: {
    color: BLUE,
    fontSize: 12,
    fontFamily: FONTS.heading,
  },
  featuredTitle: {
    color: TEXT_PRIMARY,
    fontSize: 22,
    lineHeight: 26,
    fontFamily: FONTS.heading,
  },
  featuredBody: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: FONTS.body,
  },
  featuredBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
  },
  featuredBadgeText: {
    color: BLUE,
    fontSize: 11,
    fontFamily: FONTS.body,
  },
  featuredStats: {
    flexDirection: 'row',
    gap: 12,
  },
  featuredStat: {
    flex: 1,
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 12,
    gap: 4,
    borderWidth: 1,
    borderColor: BORDER,
  },
  featuredStatLabel: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    fontFamily: FONTS.body,
  },
  featuredStatValue: {
    color: TEXT_PRIMARY,
    fontSize: 15,
    fontFamily: FONTS.heading,
  },
  quickActionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  quickActionButton: {
    minWidth: '48%',
    flexGrow: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  quickActionPrimary: {
    backgroundColor: BLUE,
    shadowColor: BLUE,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 3,
  },
  quickActionSecondary: {
    backgroundColor: CARD_ALT,
    borderWidth: 1,
    borderColor: BORDER,
  },
  quickActionPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.92,
  },
  quickActionPrimaryText: {
    color: WHITE,
    fontSize: 14,
    fontFamily: FONTS.body,
  },
  quickActionText: {
    color: TEXT_PRIMARY,
    fontSize: 14,
    fontFamily: FONTS.body,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: CARD_ALT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addressBlock: {
    gap: 8,
    backgroundColor: CARD_ALT,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: BORDER,
  },
  addressLabel: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    fontFamily: FONTS.body,
  },
  addressValue: {
    color: TEXT_PRIMARY,
    fontSize: 16,
    fontFamily: FONTS.body,
  },
  primaryButton: {
    backgroundColor: BLUE,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.92,
  },
  primaryButtonText: {
    color: WHITE,
    fontSize: 14,
    fontFamily: FONTS.body,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD_ALT,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  secondaryButtonPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.92,
  },
  secondaryButtonText: {
    color: TEXT_PRIMARY,
    fontSize: 14,
    fontFamily: FONTS.body,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    fontFamily: FONTS.body,
  },
  loadingShell: {
    gap: 10,
  },
  loadingSkeletonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  loadingSkeletonLeft: {
    flex: 1,
    gap: 8,
  },
  loadingSkeletonRight: {
    width: 112,
    gap: 8,
    alignItems: 'flex-end',
  },
  skeletonBlock: {
    backgroundColor: CARD_ALT,
    borderRadius: 999,
  },
  skeletonTitle: {
    width: '46%',
    height: 13,
  },
  skeletonLine: {
    width: '34%',
    height: 10,
  },
  skeletonValue: {
    width: '78%',
    height: 13,
  },
  skeletonLineShort: {
    width: '48%',
    height: 10,
  },
  feedbackBlock: {
    gap: 12,
  },
  errorText: {
    color: DANGER,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FONTS.body,
  },
  networkSection: {
    gap: 10,
  },
  balanceRowFeatured: {
    backgroundColor: BLUE_WASH,
    borderRadius: 16,
    paddingHorizontal: 12,
    borderTopWidth: 0,
  },
  networkHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  networkTitle: {
    color: TEXT_PRIMARY,
    fontSize: 15,
    fontFamily: FONTS.heading,
  },
  faucetButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: BLUE_WASH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    lineHeight: 18,
    paddingVertical: 8,
    fontFamily: FONTS.body,
  },
  balanceRow: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  balanceSymbol: {
    color: TEXT_PRIMARY,
    fontSize: 14,
    fontFamily: FONTS.body,
  },
  balanceName: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    marginTop: 2,
    fontFamily: FONTS.body,
  },
  balanceRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  balanceAmount: {
    color: TEXT_PRIMARY,
    fontSize: 14,
    fontFamily: FONTS.body,
  },
  balanceUsd: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    fontFamily: FONTS.body,
  },
  balanceActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  actionChip: {
    backgroundColor: BLUE,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  actionChipPressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.9,
  },
  cashOutChip: {
    backgroundColor: VIOLET,
  },
  actionChipText: {
    color: WHITE,
    fontSize: 12,
    fontFamily: FONTS.body,
  },
});
