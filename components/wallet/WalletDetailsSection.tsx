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
  ActivityIndicator,
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

  const showAlert = (title: string, message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setAlertState({ visible: true, title, message, type });
  };

  const copyAddress = async (address: string, label: string) => {
    await Clipboard.setStringAsync(address);
    showAlert('Address copied', `${label} copied to the clipboard.`, 'info');
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

  const renderBalanceRow = (balance: BalanceRecord, network: string, cashOutEnabled: boolean) => {
    const symbol = balance.token?.symbol || 'UNKNOWN';
    const rawAmount = parseFloat(balance.amount?.amount || '0');
    const decimals = parseInt(balance.amount?.decimals || '0', 10);
    const actualAmount = rawAmount / Math.pow(10, decimals || 1);

    return (
      <View
        key={`${network}-${balance.token?.contractAddress || balance.token?.mintAddress || symbol}`}
        style={styles.balanceRow}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.balanceSymbol}>{symbol}</Text>
          {balance.token?.name ? <Text style={styles.balanceName}>{balance.token.name}</Text> : null}
        </View>

        <View style={styles.balanceRight}>
          <Text style={styles.balanceAmount}>{actualAmount.toFixed(6)}</Text>
          <Text style={styles.balanceUsd}>
            {typeof balance.usdValue === 'number' ? `$${balance.usdValue.toFixed(2)}` : 'Price unavailable'}
          </Text>
          <View style={styles.balanceActions}>
            <Pressable style={styles.actionChip} onPress={() => handleTransfer(balance, network)}>
              <Text style={styles.actionChipText}>Send</Text>
            </Pressable>
            {cashOutEnabled ? (
              <Pressable style={[styles.actionChip, styles.cashOutChip]} onPress={() => handleCashOut(balance, network)}>
                <Text style={styles.actionChipText}>Cash out</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.section}>
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.cardTitle}>Wallet</Text>
            <Text style={styles.cardHint}>Receive funds, open history, and manage wallet settings.</Text>
          </View>
          <Pressable onPress={() => router.push('/settings')} style={styles.iconButton}>
            <Ionicons name="settings-outline" size={18} color={TEXT_PRIMARY} />
          </Pressable>
        </View>

        {primaryAddress ? (
          <View style={styles.addressBlock}>
            <Text style={styles.addressLabel}>Base and Ethereum address</Text>
            <Text style={styles.addressValue}>{formatAddress(primaryAddress)}</Text>
            <Pressable style={styles.secondaryButton} onPress={() => copyAddress(primaryAddress, 'Base and Ethereum address')}>
              <Text style={styles.secondaryButtonText}>Copy address</Text>
            </Pressable>
          </View>
        ) : null}

        {solanaAddress ? (
          <View style={styles.addressBlock}>
            <Text style={styles.addressLabel}>Solana address</Text>
            <Text style={styles.addressValue}>{formatAddress(solanaAddress)}</Text>
            <Pressable style={styles.secondaryButton} onPress={() => copyAddress(solanaAddress, 'Solana address')}>
              <Text style={styles.secondaryButtonText}>Copy address</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.quickLinks}>
          <Pressable style={styles.primaryButton} onPress={() => router.push('/wallet/history')}>
            <Text style={styles.primaryButtonText}>History</Text>
          </Pressable>
          <Pressable style={styles.secondaryWideButton} onPress={() => router.push('/settings')}>
            <Text style={styles.secondaryButtonText}>Settings</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.card}>
        <Pressable style={styles.cardHeader} onPress={() => setBalancesExpanded(prev => !prev)}>
          <View>
            <Text style={styles.cardTitle}>Mainnet balances</Text>
            <Text style={styles.cardHint}>Base, Ethereum, and Solana balances with send and cash-out actions.</Text>
          </View>
          <Ionicons name={balancesExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={TEXT_SECONDARY} />
        </Pressable>

        {balancesExpanded ? (
          <>
            {loadingBalances ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={BLUE} />
                <Text style={styles.loadingText}>Loading balances...</Text>
              </View>
            ) : null}

            {balancesError ? (
              <View style={styles.feedbackBlock}>
                <Text style={styles.errorText}>{balancesError}</Text>
                <Pressable style={styles.primaryButton} onPress={fetchBalances}>
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
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={BLUE} />
                <Text style={styles.loadingText}>Loading testnet balances...</Text>
              </View>
            ) : null}

            {testnetBalancesError ? (
              <View style={styles.feedbackBlock}>
                <Text style={styles.errorText}>{testnetBalancesError}</Text>
                <Pressable style={styles.primaryButton} onPress={fetchTestnetBalances}>
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
  quickLinks: {
    flexDirection: 'row',
    gap: 12,
  },
  primaryButton: {
    backgroundColor: BLUE,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
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
  secondaryWideButton: {
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD_ALT,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
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
  cashOutChip: {
    backgroundColor: VIOLET,
  },
  actionChipText: {
    color: WHITE,
    fontSize: 12,
    fontFamily: FONTS.body,
  },
});
