import { useDialContentClearance } from '@/components/dial/dialLayout';
import { ProfileButton } from '@/components/navigation/ProfileButton';
import { RegentPressable } from '@/components/ui/RegentPressable';
import { useRegentsAuth } from '@/hooks/useRegentsAuth';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import type { BaseWalletHoldings, MobileAgentsList } from '@/types/regents';
import { formatWalletAddress } from '@/utils/agent-surfaces/formatters';
import { formatUsdcBalance } from '@/utils/agents/kinds';
import { listAutolaunchAuctions } from '@/utils/autolaunch/client';
import {
  agentCountCopy,
  agentsUsdcTotal,
  MAX_PORTFOLIO_WALLETS,
  openAuctionCount,
  openAuctionsCopy,
  websiteWalletAddresses,
} from '@/utils/home/homeSummary';
import { routes } from '@/utils/navigation/routes';
import { displayTokenAmount } from '@/utils/onchain/tokenDisplay';
import { regentApi } from '@/utils/regentApi/client';
import { fetchTechtreeResults, type TechtreeResultCard } from '@/utils/techtreeResults';
import { useCurrentUser } from '@coinbase/cdp-hooks';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type SectionState<T> = { status: 'loading' } | { status: 'ready'; data: T } | { status: 'failed' };

/** One Home card's own read: a failure here leaves every other card alone. */
function useSection<T>(read: () => Promise<T>) {
  const [state, setState] = useState<SectionState<T>>({ status: 'loading' });
  const load = useCallback(async () => {
    try {
      setState({ status: 'ready', data: await read() });
    } catch {
      setState({ status: 'failed' });
    }
  }, [read]);
  return [state, load] as const;
}

function smartWalletAddress(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed && /^0x[a-fA-F0-9]{40}$/.test(trimmed) ? trimmed : null;
}

export default function HomeTab() {
  const router = useRouter();
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const dialClearance = useDialContentClearance();
  const { currentUser } = useCurrentUser();
  const { privyUser } = useRegentsAuth();
  const phoneWallet = smartWalletAddress(currentUser?.evmSmartAccounts?.[0] as string | undefined);
  const websiteWallets = useMemo(
    () => websiteWalletAddresses(privyUser?.linked_accounts ?? [], phoneWallet),
    [phoneWallet, privyUser?.linked_accounts],
  );
  const websiteWalletsKey = websiteWallets.join(',');
  const [refreshing, setRefreshing] = useState(false);

  const readPhoneWallet = useCallback(async () => {
    if (!phoneWallet) {
      return null;
    }
    const portfolio = await regentApi.getPortfolio({ wallets: [phoneWallet] });
    return portfolio.wallets[0] ?? null;
  }, [phoneWallet]);

  const readWebsiteWallets = useCallback(async () => {
    const wallets = websiteWalletsKey ? websiteWalletsKey.split(',').slice(0, MAX_PORTFOLIO_WALLETS) : [];
    if (wallets.length === 0) {
      return [];
    }
    const portfolio = await regentApi.getPortfolio({ wallets });
    return portfolio.wallets;
  }, [websiteWalletsKey]);

  const readAgents = useCallback(() => regentApi.listAgents(), []);
  const readAuctions = useCallback(async () => openAuctionCount(await listAutolaunchAuctions()), []);
  const readTechtree = useCallback(async () => (await fetchTechtreeResults()).cards[0] ?? null, []);

  const [phone, loadPhone] = useSection(readPhoneWallet);
  const [website, loadWebsite] = useSection(readWebsiteWallets);
  const [agents, loadAgents] = useSection(readAgents);
  const [auctions, loadAuctions] = useSection(readAuctions);
  const [techtree, loadTechtree] = useSection(readTechtree);

  const loadAll = useCallback(
    () => Promise.all([loadPhone(), loadWebsite(), loadAgents(), loadAuctions(), loadTechtree()]),
    [loadAgents, loadAuctions, loadPhone, loadTechtree, loadWebsite],
  );

  useFocusEffect(
    useCallback(() => {
      void loadAll();
    }, [loadAll])
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }, [loadAll]);

  const open = useCallback((href: Href) => router.push(href), [router]);

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <ScrollView
        style={styles.scroller}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, { paddingBottom: dialClearance }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.accent} />}
      >
        <View style={styles.header}>
          <View style={styles.titleGroup}>
            <Text style={styles.eyebrow}>Home</Text>
            <Text style={styles.title}>Everything you hold</Text>
            <Text style={styles.subtitle}>Your wallets, agents, launches and research in one place.</Text>
          </View>
          <ProfileButton />
        </View>

        <HomeCard
          icon="phone-portrait-outline"
          title="Phone wallet"
          action={{ label: 'Open Earn', onPress: () => open(routes.earn()) }}
        >
          <SectionBody state={phone} failedCopy="Balances aren't available right now.">
            {(holdings) =>
              holdings ? (
                <WalletHoldings holdings={holdings} />
              ) : (
                <Notice text="Your phone wallet shows here once it is set up." />
              )
            }
          </SectionBody>
        </HomeCard>

        <HomeCard
          icon="globe-outline"
          title={websiteWallets.length > 1 ? 'Website wallets' : 'Website wallet'}
          action={websiteWallets.length > 0 ? { label: 'Open regents.sh', onPress: () => void Linking.openURL('https://regents.sh') } : undefined}
        >
          {websiteWallets.length === 0 ? (
            <Notice text="No website wallet is linked to your account." />
          ) : (
            <>
              <Text style={styles.viewOnly}>View only. Manage it on regents.sh.</Text>
              <SectionBody state={website} failedCopy="Balances aren't available right now.">
                {(wallets) => (
                  <View style={styles.walletList}>
                    {wallets.map((holdings) => (
                      <WalletHoldings key={holdings.wallet_address} holdings={holdings} />
                    ))}
                    {websiteWallets.length > MAX_PORTFOLIO_WALLETS ? (
                      <Notice text={`Showing ${MAX_PORTFOLIO_WALLETS} of ${websiteWallets.length} wallets.`} />
                    ) : null}
                  </View>
                )}
              </SectionBody>
            </>
          )}
        </HomeCard>

        <HomeCard
          icon="people-outline"
          title="My agents"
          action={{ label: 'Open My agents', onPress: () => open(routes.agents()) }}
        >
          <SectionBody state={agents} failedCopy="Your agents aren't available right now.">
            {(list) => <AgentsSummary list={list} />}
          </SectionBody>
        </HomeCard>

        <HomeCard
          icon="rocket-outline"
          title="Autolaunch"
          action={{ label: 'Open Autolaunch', onPress: () => open(routes.autolaunch()) }}
        >
          <SectionBody state={auctions} failedCopy="Auctions aren't available right now.">
            {(count) => <Text style={styles.headline}>{openAuctionsCopy(count)}</Text>}
          </SectionBody>
        </HomeCard>

        <HomeCard
          icon="git-branch-outline"
          title="Techtree"
          action={{ label: 'Open Techtree', onPress: () => open(routes.techtree()) }}
        >
          <SectionBody state={techtree} failedCopy="Techtree isn't available right now.">
            {(latest) => <LatestPublication latest={latest} />}
          </SectionBody>
        </HomeCard>
      </ScrollView>
    </SafeAreaView>
  );
}

function HomeCard({
  action,
  children,
  icon,
  title,
}: {
  action?: { label: string; onPress: () => void };
  children: ReactNode;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
}) {
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardIcon}>
          <Ionicons name={icon} size={18} color={colors.accent} />
        </View>
        <Text style={styles.cardTitle}>{title}</Text>
      </View>
      {children}
      {action ? (
        <RegentPressable style={styles.cardAction} onPress={action.onPress} accessibilityRole="button">
          <Text style={styles.cardActionText}>{action.label}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.accent} />
        </RegentPressable>
      ) : null}
    </View>
  );
}

function SectionBody<T>({
  children,
  failedCopy,
  state,
}: {
  children: (data: T) => ReactNode;
  failedCopy: string;
  state: SectionState<T>;
}) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  if (state.status === 'loading') {
    return (
      <View style={styles.loadingRow}>
        <ActivityIndicator size="small" color={theme.colors.accent} />
      </View>
    );
  }
  if (state.status === 'failed') {
    return <Notice text={failedCopy} />;
  }
  return <>{children(state.data)}</>;
}

function Notice({ text }: { text: string }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.notice}>
      <Ionicons name="information-circle-outline" size={16} color={theme.colors.textMuted} />
      <Text style={styles.noticeText}>{text}</Text>
    </View>
  );
}

function WalletHoldings({ holdings }: { holdings: BaseWalletHoldings }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const figures = [
    { label: 'USDC', value: displayTokenAmount(holdings.usdc_balance) },
    { label: 'ETH', value: displayTokenAmount(holdings.eth_balance) },
    { label: 'REGENT', value: displayTokenAmount(holdings.regent_balance) },
    { label: 'Staked REGENT', value: displayTokenAmount(holdings.staked_regent) },
    { label: 'USDC rewards ready', value: displayTokenAmount(holdings.claimable_usdc) },
    { label: 'REGENT rewards ready', value: displayTokenAmount(holdings.claimable_regent) },
  ];
  return (
    <View style={styles.holdings}>
      <Text style={styles.address}>{formatWalletAddress(holdings.wallet_address)}</Text>
      <View style={styles.figureGrid}>
        {figures.map((figure) => (
          <View key={figure.label} style={styles.figure}>
            <Text style={styles.figureLabel}>{figure.label}</Text>
            <Text style={styles.figureValue}>{figure.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function AgentsSummary({ list }: { list: MobileAgentsList }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  if (list.agents.length === 0) {
    return <Text style={styles.headline}>No agents yet.</Text>;
  }
  return (
    <View style={styles.summary}>
      <Text style={styles.headline}>{agentCountCopy(list.agents.length)}</Text>
      {list.balancesAvailable ? (
        <Text style={styles.detail}>{formatUsdcBalance(agentsUsdcTotal(list.agents))} in total</Text>
      ) : (
        <Notice text="Balances aren't available right now." />
      )}
    </View>
  );
}

function LatestPublication({ latest }: { latest: TechtreeResultCard | null }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  if (!latest) {
    return <Text style={styles.headline}>Nothing published yet.</Text>;
  }
  return (
    <View style={styles.summary}>
      <Text style={styles.detailLabel}>Latest</Text>
      <Text style={styles.headline}>{latest.skillName}</Text>
      <Text style={styles.detail}>
        {latest.climbName} · {latest.date}
      </Text>
    </View>
  );
}

function makeStyles({ colors, fonts }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    scroller: {
      flex: 1,
    },
    content: {
      paddingHorizontal: 20,
      gap: 14,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 16,
      paddingTop: 8,
      paddingBottom: 4,
    },
    titleGroup: {
      flex: 1,
      minWidth: 0,
      gap: 6,
    },
    eyebrow: {
      color: colors.accent,
      fontSize: 12,
      textTransform: 'uppercase',
      fontFamily: fonts.ui,
    },
    title: {
      color: colors.text,
      fontSize: 32,
      lineHeight: 38,
      fontFamily: fonts.title,
    },
    subtitle: {
      color: colors.textMuted,
      fontSize: 15,
      lineHeight: 21,
      fontFamily: fonts.ui,
    },
    card: {
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.hairlineStrong,
      borderRadius: 22,
      padding: 18,
      gap: 12,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    cardIcon: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.accentWash,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardTitle: {
      flex: 1,
      color: colors.text,
      fontSize: 18,
      lineHeight: 22,
      fontFamily: fonts.title,
    },
    cardAction: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 4,
      paddingVertical: 4,
    },
    cardActionText: {
      color: colors.accent,
      fontSize: 14,
      fontFamily: fonts.ui,
    },
    loadingRow: {
      minHeight: 32,
      alignItems: 'flex-start',
      justifyContent: 'center',
    },
    notice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    noticeText: {
      flex: 1,
      color: colors.textMuted,
      fontSize: 14,
      lineHeight: 20,
      fontFamily: fonts.ui,
    },
    viewOnly: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 18,
      fontFamily: fonts.ui,
    },
    walletList: {
      gap: 14,
    },
    holdings: {
      gap: 8,
    },
    address: {
      color: colors.text,
      fontSize: 13,
      fontFamily: fonts.ui,
    },
    figureGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    figure: {
      flexGrow: 1,
      flexBasis: '30%',
      minWidth: 96,
      padding: 10,
      borderRadius: 14,
      backgroundColor: colors.surface,
      gap: 4,
    },
    figureLabel: {
      color: colors.textMuted,
      fontSize: 11,
      fontFamily: fonts.ui,
    },
    figureValue: {
      color: colors.text,
      fontSize: 15,
      lineHeight: 19,
      fontFamily: fonts.title,
    },
    summary: {
      gap: 4,
    },
    headline: {
      color: colors.text,
      fontSize: 17,
      lineHeight: 22,
      fontFamily: fonts.title,
    },
    detailLabel: {
      color: colors.textMuted,
      fontSize: 12,
      fontFamily: fonts.ui,
    },
    detail: {
      color: colors.textMuted,
      fontSize: 14,
      lineHeight: 20,
      fontFamily: fonts.ui,
    },
  });
}
