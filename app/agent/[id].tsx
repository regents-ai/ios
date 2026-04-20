import { CoinbaseAlert } from '@/components/ui/CoinbaseAlerts';
import { COLORS } from '@/constants/Colors';
import { TEST_ACCOUNTS } from '@/constants/TestAccounts';
import { FONTS } from '@/constants/Typography';
import { AgentDetail, AgentSummary, AgentWithdrawal, PaperclipDetail, WalletFundingChoice } from '@/types/agents';
import { createAgentWithdrawal } from '@/utils/createAgentWithdrawal';
import { createTerminalSession } from '@/utils/createTerminalSession';
import { fetchAgent } from '@/utils/fetchAgent';
import { fetchAgentPaperclip } from '@/utils/fetchAgentPaperclip';
import { fetchTerminalSessions } from '@/utils/fetchTerminalSessions';
import { fetchWalletFundingChoices } from '@/utils/fetchWalletFundingChoices';
import {
  clearPendingAgentFundings,
  getPendingAgentFundings,
  getTestWalletSol,
  isTestSessionActive,
} from '@/utils/sharedState';
import { useCurrentUser, useEvmAddress, useSolanaAddress } from '@coinbase/cdp-hooks';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

const { DARK_BG, CARD_BG, CARD_ALT, TEXT_PRIMARY, TEXT_SECONDARY, BLUE, BORDER, WHITE, BLUE_WASH, SUCCESS, DANGER } = COLORS;

const AMBER = '#A3703A';
const AMBER_WASH = '#F2E7DA';
const GREEN_WASH = '#E6F0EA';
const RED_WASH = '#F3E1DD';

function formatAddress(address: string) {
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

function formatCurrency(amount: string) {
  return Number(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatRelativeTime(dateString: string) {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const diffMinutes = Math.max(1, Math.round(diffMs / 60000));
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.round(diffHours / 24)}d ago`;
}

function runtimeCopy(runtimeStatus: AgentSummary['runtimeStatus']) {
  switch (runtimeStatus) {
    case 'online':
      return 'Online';
    case 'waiting':
      return 'Waiting';
    case 'offline':
      return 'Offline';
  }
}

function withdrawalCopy(status: AgentWithdrawal['status']) {
  switch (status) {
    case 'requested':
      return 'Requested';
    case 'approved':
      return 'Approved';
    case 'broadcasting':
      return 'Broadcasting';
    case 'confirmed':
      return 'Confirmed';
    case 'failed':
      return 'Failed';
  }
}

function networkSlug(network: string) {
  return network.toLowerCase().replace(/\s+/g, '-');
}

function runtimeTone(runtimeStatus: AgentSummary['runtimeStatus']) {
  switch (runtimeStatus) {
    case 'online':
      return { accent: SUCCESS, wash: GREEN_WASH };
    case 'waiting':
      return { accent: AMBER, wash: AMBER_WASH };
    case 'offline':
      return { accent: DANGER, wash: RED_WASH };
  }
}

function statusTone(status: AgentWithdrawal['status']) {
  switch (status) {
    case 'requested':
    case 'approved':
    case 'broadcasting':
      return { accent: AMBER, wash: AMBER_WASH };
    case 'confirmed':
      return { accent: SUCCESS, wash: GREEN_WASH };
    case 'failed':
      return { accent: DANGER, wash: RED_WASH };
  }
}

function rosterReadyCount(paperclip: PaperclipDetail | null) {
  if (!paperclip) {
    return 0;
  }

  return paperclip.roster.filter((member) => {
    const lower = member.status.toLowerCase();
    return lower.includes('ready') || lower.includes('online') || lower.includes('track');
  }).length;
}

export default function AgentDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const agentId = typeof params.id === 'string' ? params.id : '';
  const testSession = isTestSessionActive();
  const { currentUser } = useCurrentUser();
  const { evmAddress } = useEvmAddress();
  const { solanaAddress: cdpSolanaAddress } = useSolanaAddress();

  const explicitEOAAddress = testSession ? TEST_ACCOUNTS.wallets.eoaDummy : (currentUser?.evmAccounts?.[0] as string | undefined);
  const smartAccountAddress = testSession ? TEST_ACCOUNTS.wallets.evm : (currentUser?.evmSmartAccounts?.[0] as string | undefined);
  const solanaAddress = testSession ? getTestWalletSol() : cdpSolanaAddress;
  const primaryAddress = smartAccountAddress || explicitEOAAddress || evmAddress || null;
  const defaultWithdrawalAddress = primaryAddress || solanaAddress || '';
  const hasMobileWalletAddress = !!defaultWithdrawalAddress;

  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [paperclip, setPaperclip] = useState<PaperclipDetail | null>(null);
  const [fundingChoices, setFundingChoices] = useState<WalletFundingChoice[]>([]);
  const [pendingFunding, setPendingFunding] = useState<ReturnType<typeof getPendingAgentFundings>>([]);
  const [loading, setLoading] = useState(true);
  const [openingTerminal, setOpeningTerminal] = useState(false);
  const [withdrawalModalVisible, setWithdrawalModalVisible] = useState(false);
  const [withdrawalAmount, setWithdrawalAmount] = useState('');
  const [withdrawalIntentKey, setWithdrawalIntentKey] = useState<string | null>(null);
  const [submittingWithdrawal, setSubmittingWithdrawal] = useState(false);
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

  const loadAgent = useCallback(async () => {
    if (!agentId) {
      return;
    }

    try {
      setLoading(true);
      const [detail, nextFundingChoices, nextPaperclip] = await Promise.all([
        fetchAgent(agentId),
        fetchWalletFundingChoices({
          evmAddress: primaryAddress,
          solanaAddress,
        }),
        fetchAgentPaperclip(agentId),
      ]);

      setAgent(detail);
      setFundingChoices(nextFundingChoices);
      setPaperclip(nextPaperclip);
      setPendingFunding(getPendingAgentFundings(agentId));
    } catch (error) {
      setAlertState({
        visible: true,
        title: 'Unable to load this agent',
        message: error instanceof Error ? error.message : 'Try again in a moment.',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [agentId, primaryAddress, solanaAddress]);

  useFocusEffect(
    useCallback(() => {
      loadAgent();
    }, [loadAgent])
  );

  const fundingSummary = useMemo(() => {
    if (!fundingChoices.length) {
      return 'No stablecoin balance is ready to send yet.';
    }

    return `${fundingChoices.length} stablecoin balance${fundingChoices.length === 1 ? '' : 's'} ready to fund this agent.`;
  }, [fundingChoices.length]);

  const agentIsOffline = agent?.runtimeStatus === 'offline';
  const agentHasWallet = !!agent?.walletAddress;
  const canOpenTerminal = !!agent && !agentIsOffline;
  const canRequestWithdrawal = !!agent && !agentIsOffline && hasMobileWalletAddress;
  const runtime = runtimeTone(agent?.runtimeStatus || 'waiting');
  const topGoal = paperclip?.goals[0];
  const nextTask = paperclip?.activeTasks[0];
  const latestEvent = paperclip?.recentEvents[0];
  const teamReady = rosterReadyCount(paperclip);
  const activeWithdrawal = agent?.withdrawals.find((withdrawal) => withdrawal.status !== 'confirmed' && withdrawal.status !== 'failed');

  const openPaperclip = useCallback(() => {
    if (!agent) {
      return;
    }

    router.push({ pathname: '/agent/[id]/paperclip' as any, params: { id: agent.id } });
  }, [agent, router]);

  const startFunding = (choice: WalletFundingChoice) => {
    if (!agent || !agent.walletAddress) {
      setAlertState({
        visible: true,
        title: 'Wallet unavailable',
        message: 'This agent does not have a wallet ready for funding yet.',
        type: 'error',
      });
      return;
    }

    router.push({
      pathname: '/wallet/send',
      params: {
        token: JSON.stringify(choice),
        network: networkSlug(choice.network),
        recipientAddress: agent.walletAddress,
        recipientLabel: agent.name,
        sourceAgentId: agent.id,
        sourceAgentName: agent.name,
      },
    });
  };

  const openTerminal = useCallback(async () => {
    if (!agent) {
      return;
    }

    if (agent.runtimeStatus === 'offline') {
      setAlertState({
        visible: true,
        title: 'Terminal unavailable',
        message: `${agent.name} is offline right now. Bring the agent back online, then try again.`,
        type: 'error',
      });
      return;
    }

    try {
      setOpeningTerminal(true);
      const existingSessions = await fetchTerminalSessions();
      const existingSession = existingSessions.find((session) => session.agentId === agent.id);
      const session = existingSession
        ? existingSession
        : await createTerminalSession({
            agentId: agent.id,
            agentName: agent.name,
          });

      router.push({ pathname: '/terminal/[id]' as any, params: { id: session.id } });
    } catch (error) {
      setAlertState({
        visible: true,
        title: 'Unable to open terminal',
        message: error instanceof Error ? error.message : 'Try again in a moment.',
        type: 'error',
      });
    } finally {
      setOpeningTerminal(false);
    }
  }, [agent, router]);

  const submitWithdrawal = async () => {
    if (!agent) {
      return;
    }

    if (!withdrawalAmount || Number(withdrawalAmount) <= 0) {
      setAlertState({
        visible: true,
        title: 'Enter an amount',
        message: 'Choose how much should come back from this agent.',
        type: 'error',
      });
      return;
    }

    if (!defaultWithdrawalAddress) {
      setAlertState({
        visible: true,
        title: 'Wallet address unavailable',
        message: 'Open your wallet first so the app knows where the funds should return.',
        type: 'error',
      });
      return;
    }

    try {
      setSubmittingWithdrawal(true);
      const nextWithdrawal = await createAgentWithdrawal({
        agentId: agent.id,
        amount: withdrawalAmount,
        currency: agent.stablecoinSymbol,
        destinationWalletAddress: defaultWithdrawalAddress,
        idempotencyKey: withdrawalIntentKey || `${agent.id}:${Date.now()}`,
      });

      setAgent((current) => current ? {
        ...current,
        withdrawals: [nextWithdrawal, ...current.withdrawals],
        runtimeStatus: 'waiting',
        status: 'attention',
      } : current);
      clearPendingAgentFundings(agent.id);
      setPendingFunding([]);

      setWithdrawalAmount('');
      setWithdrawalIntentKey(null);
      setWithdrawalModalVisible(false);
      setAlertState({
        visible: true,
        title: 'Withdrawal requested',
        message: `${withdrawalAmount} ${agent.stablecoinSymbol} is now queued to return to your wallet.`,
        type: 'success',
      });
    } catch (error) {
      setAlertState({
        visible: true,
        title: 'Unable to request withdrawal',
        message: error instanceof Error ? error.message : 'Try again in a moment.',
        type: 'error',
      });
    } finally {
      setSubmittingWithdrawal(false);
    }
  };

  let nextAction = {
    eyebrow: 'Next step',
    title: 'Review this agent',
    body: 'Open the latest summary and decide what needs to happen next.',
    cta: 'Open summary',
    onPress: () => {},
    accent: BLUE,
    wash: BLUE_WASH,
  };

  if (agent) {
    if (agent.runtimeStatus === 'offline') {
      nextAction = {
        eyebrow: 'Needs attention now',
        title: 'Bring this agent back online',
        body: 'Terminal access and withdrawal requests will be available again once the runtime is back.',
        cta: 'Open summary',
        onPress: openPaperclip,
        accent: DANGER,
        wash: RED_WASH,
      };
    } else if (pendingFunding.length > 0) {
      nextAction = {
        eyebrow: 'Money in motion',
        title: 'Watch the incoming transfer',
        body: 'Refresh after settlement to confirm the new treasury total.',
        cta: 'Refresh treasury',
        onPress: loadAgent,
        accent: BLUE,
        wash: BLUE_WASH,
      };
    } else if (!agentHasWallet) {
      nextAction = {
        eyebrow: 'Setup still in progress',
        title: 'Wait for the wallet to be ready',
        body: 'Funding will appear here as soon as this agent has a wallet.',
        cta: 'Open summary',
        onPress: openPaperclip,
        accent: AMBER,
        wash: AMBER_WASH,
      };
    } else if (!hasMobileWalletAddress) {
      nextAction = {
        eyebrow: 'One step first',
        title: 'Open your wallet before requesting funds back',
        body: 'The app needs your wallet address before it can return funds from this agent.',
        cta: 'Go to wallet',
        onPress: () => router.push('/wallet'),
        accent: AMBER,
        wash: AMBER_WASH,
      };
    } else if (activeWithdrawal) {
      nextAction = {
        eyebrow: 'Return in progress',
        title: 'Track funds coming back to your wallet',
        body: 'The latest request is still moving. Refresh to see when it clears.',
        cta: 'Refresh status',
        onPress: loadAgent,
        accent: AMBER,
        wash: AMBER_WASH,
      };
    } else if (agent.runtimeStatus === 'waiting') {
      nextAction = {
        eyebrow: 'Ready for review',
        title: 'Check what is waiting',
        body: 'There may be new work, approvals, or follow-ups ready in the terminal.',
        cta: 'Open terminal',
        onPress: openTerminal,
        accent: AMBER,
        wash: AMBER_WASH,
      };
    } else {
      nextAction = {
        eyebrow: 'Fastest path',
        title: 'Open the terminal',
        body: 'This is the quickest way to see what the agent is doing right now.',
        cta: 'Open terminal',
        onPress: openTerminal,
        accent: SUCCESS,
        wash: GREEN_WASH,
      };
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={BLUE} />
          <Text style={styles.loadingText}>Loading agent details…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!agent) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerState}>
          <Text style={styles.emptyTitle}>This agent is unavailable</Text>
          <Pressable style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]} onPress={() => router.back()}>
            <Text style={styles.primaryButtonText}>Back to agents</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}>
          <Ionicons name="chevron-back" size={22} color={TEXT_PRIMARY} />
        </Pressable>
        <Text style={styles.headerTitle}>{agent.name}</Text>
        <Pressable onPress={loadAgent} style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}>
          <Ionicons name="refresh" size={18} color={BLUE} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View style={styles.heroTitleBlock}>
              <Text style={styles.eyebrow}>Agent treasury</Text>
              <Text style={styles.heroTitle}>{agent.name}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: runtime.wash }]}>
              <View style={[styles.statusDot, { backgroundColor: runtime.accent }]} />
              <Text style={[styles.statusBadgeText, { color: runtime.accent }]}>{runtimeCopy(agent.runtimeStatus)}</Text>
            </View>
          </View>
          <Text style={styles.heroIntro}>{agent.runtimeHeadline}</Text>
          <Text style={styles.heroMeta}>{agent.mission}</Text>
          <View style={styles.heroActions}>
            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                (!canOpenTerminal || openingTerminal) && styles.disabledButton,
                pressed && canOpenTerminal && !openingTerminal && styles.primaryButtonPressed,
              ]}
              onPress={openTerminal}
              disabled={!canOpenTerminal || openingTerminal}
            >
              <Text style={styles.primaryButtonText}>{openingTerminal ? 'Opening…' : 'Open terminal'}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
              onPress={openPaperclip}
            >
              <Text style={styles.secondaryButtonText}>Open Paperclip</Text>
            </Pressable>
          </View>
        </View>

        <View style={[styles.priorityCard, { backgroundColor: nextAction.wash }]}>
          <Text style={[styles.priorityEyebrow, { color: nextAction.accent }]}>{nextAction.eyebrow}</Text>
          <Text style={styles.priorityTitle}>{nextAction.title}</Text>
          <Text style={styles.priorityBody}>{nextAction.body}</Text>
          <Pressable
            style={({ pressed }) => [
              styles.priorityButton,
              { backgroundColor: nextAction.accent },
              pressed && styles.primaryButtonPressed,
            ]}
            onPress={nextAction.onPress}
          >
            <Text style={styles.priorityButtonText}>{nextAction.cta}</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Treasury snapshot</Text>
          <View style={styles.snapshotGrid}>
            <View style={styles.snapshotTile}>
              <Text style={styles.snapshotLabel}>Stablecoin balance</Text>
              <Text style={styles.snapshotValue}>{agent.stablecoinSymbol} {formatCurrency(agent.stablecoinBalance)}</Text>
            </View>
            <View style={styles.snapshotTile}>
              <Text style={styles.snapshotLabel}>Agent wallet</Text>
              <Text style={styles.snapshotValue}>{formatAddress(agent.walletAddress)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleBlock}>
              <Text style={styles.sectionTitle}>Paperclip</Text>
              <Text style={styles.sectionHint}>The quickest read on what matters now, what moves next, and what changed most recently.</Text>
            </View>
            <Pressable
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
              onPress={openPaperclip}
            >
              <Text style={styles.secondaryButtonText}>Open</Text>
            </Pressable>
          </View>

          {paperclip ? (
            <>
              <View style={styles.paperclipLeadCard}>
                <Text style={styles.paperclipHeadline}>{paperclip.headline}</Text>
                <Text style={styles.paperclipSummary}>{paperclip.companySummary}</Text>
              </View>
              <View style={styles.paperclipGrid}>
                <View style={styles.paperclipSignalCard}>
                  <Text style={styles.paperclipSignalLabel}>Top goal</Text>
                  <Text style={styles.paperclipSignalTitle}>{topGoal?.title || 'No goal listed yet'}</Text>
                  <Text style={styles.paperclipSignalBody}>{topGoal?.status || 'Waiting for an update'}</Text>
                </View>
                <View style={styles.paperclipSignalCard}>
                  <Text style={styles.paperclipSignalLabel}>Next task</Text>
                  <Text style={styles.paperclipSignalTitle}>{nextTask?.title || 'No active task yet'}</Text>
                  <Text style={styles.paperclipSignalBody}>{nextTask?.owner ? `Owned by ${nextTask.owner}` : 'Owner not listed'}</Text>
                </View>
                <View style={styles.paperclipSignalCard}>
                  <Text style={styles.paperclipSignalLabel}>Latest change</Text>
                  <Text style={styles.paperclipSignalTitle}>{latestEvent?.title || 'No recent event yet'}</Text>
                  <Text style={styles.paperclipSignalBody}>{latestEvent ? formatRelativeTime(latestEvent.at) : 'Waiting for the first update'}</Text>
                </View>
                <View style={styles.paperclipSignalCard}>
                  <Text style={styles.paperclipSignalLabel}>Team ready</Text>
                  <Text style={styles.paperclipSignalTitle}>{teamReady}/{paperclip.roster.length}</Text>
                  <Text style={styles.paperclipSignalBody}>People ready to move right now</Text>
                </View>
              </View>
            </>
          ) : (
            <View style={styles.emptyPanel}>
              <Text style={styles.emptyPanelText}>Paperclip will appear here once this agent’s mobile summary is ready.</Text>
            </View>
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleBlock}>
              <Text style={styles.sectionTitle}>Fund this agent</Text>
              <Text style={styles.sectionHint}>{fundingSummary}</Text>
            </View>
          </View>

          {pendingFunding.length > 0 ? (
            <View style={styles.pendingCard}>
              <Text style={styles.pendingTitle}>Money is on the way</Text>
              {pendingFunding.map((item) => (
                <Text key={`${item.createdAt}-${item.amount}`} style={styles.pendingBody}>
                  {item.amount} {item.currency} was sent from your wallet on {item.network}. Refresh after it settles to see the updated treasury total.
                </Text>
              ))}
            </View>
          ) : null}

          {!agentHasWallet ? (
            <View style={styles.emptyPanel}>
              <Text style={styles.emptyPanelText}>This agent does not have a wallet ready yet, so funding is not available.</Text>
            </View>
          ) : fundingChoices.length === 0 ? (
            <View style={styles.emptyPanel}>
              <Text style={styles.emptyPanelText}>{hasMobileWalletAddress ? 'Open your wallet and receive stablecoins before funding this agent.' : 'Open your wallet first so the app can load balances for funding.'}</Text>
            </View>
          ) : (
            <View style={styles.choiceList}>
              {fundingChoices.map((choice) => {
                const rawAmount = parseFloat(choice.amount?.amount || '0');
                const decimals = parseInt(choice.amount?.decimals || '0', 10);
                const normalizedAmount = decimals > 0 ? rawAmount / Math.pow(10, decimals) : rawAmount;

                return (
                  <Pressable
                    key={`${choice.network}-${choice.token?.symbol}-${choice.token?.contractAddress || choice.token?.mintAddress || 'native'}`}
                    style={({ pressed }) => [styles.choiceRow, pressed && styles.choiceRowPressed]}
                    onPress={() => startFunding(choice)}
                  >
                    <View style={styles.choiceCopy}>
                      <Text style={styles.choiceTitle}>{choice.token?.symbol || 'Token'} on {choice.network}</Text>
                      <Text style={styles.choiceSubtitle}>{normalizedAmount.toFixed(2)} available to send now</Text>
                    </View>
                    <View style={styles.choiceAction}>
                      <Text style={styles.choiceActionText}>Use this balance</Text>
                      <Ionicons name="arrow-forward" size={18} color={BLUE} />
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleBlock}>
              <Text style={styles.sectionTitle}>Request a withdrawal</Text>
              <Text style={styles.sectionHint}>Ask this agent to return funds to your mobile wallet.</Text>
            </View>
            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                !canRequestWithdrawal && styles.disabledButton,
                pressed && canRequestWithdrawal && styles.primaryButtonPressed,
              ]}
              onPress={() => {
                setWithdrawalIntentKey(`${agent.id}:${Date.now()}`);
                setWithdrawalModalVisible(true);
              }}
              disabled={!canRequestWithdrawal}
            >
              <Text style={styles.primaryButtonText}>Request</Text>
            </Pressable>
          </View>

          {!hasMobileWalletAddress ? (
            <View style={styles.emptyPanel}>
              <Text style={styles.emptyPanelText}>Open your wallet first so this agent knows where returned funds should go.</Text>
            </View>
          ) : null}

          {agent.withdrawals.length === 0 ? (
            <View style={styles.emptyPanel}>
              <Text style={styles.emptyPanelText}>No withdrawal requests yet.</Text>
            </View>
          ) : (
            <View style={styles.timeline}>
              {agent.withdrawals.map((withdrawal) => {
                const tone = statusTone(withdrawal.status);
                return (
                  <View key={withdrawal.id} style={styles.timelineRow}>
                    <View style={[styles.timelineDot, { backgroundColor: tone.accent }]} />
                    <View style={styles.timelineCard}>
                      <View style={styles.timelineHeader}>
                        <Text style={styles.timelineTitle}>{withdrawal.amount} {withdrawal.currency}</Text>
                        <View style={[styles.timelinePill, { backgroundColor: tone.wash }]}>
                          <Text style={[styles.timelinePillText, { color: tone.accent }]}>{withdrawalCopy(withdrawal.status)}</Text>
                        </View>
                      </View>
                      <Text style={styles.timelineSubtitle}>{new Date(withdrawal.updatedAt).toLocaleString()}</Text>
                      <Text style={styles.timelineBody}>Returning to {formatAddress(withdrawal.destinationWalletAddress)}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Recent activity</Text>
          <View style={styles.timeline}>
            {agent.recentActivity.map((activity) => (
              <View key={activity.id} style={styles.timelineRow}>
                <View style={styles.timelineDot} />
                <View style={styles.timelineCard}>
                  <Text style={styles.timelineTitle}>{activity.title}</Text>
                  <Text style={styles.timelineSubtitle}>{new Date(activity.at).toLocaleString()}</Text>
                  <Text style={styles.timelineBody}>{activity.detail}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      <Modal visible={withdrawalModalVisible} transparent animationType="fade" onRequestClose={() => {
        setWithdrawalModalVisible(false);
        setWithdrawalIntentKey(null);
      }}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Request funds back</Text>
            <Text style={styles.modalBody}>Choose how much {agent.stablecoinSymbol} should return from {agent.name}.</Text>
            <TextInput
              style={styles.input}
              value={withdrawalAmount}
              onChangeText={setWithdrawalAmount}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={TEXT_SECONDARY}
            />
            <View style={styles.modalButtons}>
              <Pressable
                style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
                onPress={() => {
                  setWithdrawalModalVisible(false);
                  setWithdrawalIntentKey(null);
                }}
              >
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.primaryButton, pressed && !submittingWithdrawal && styles.primaryButtonPressed]}
                onPress={submitWithdrawal}
                disabled={submittingWithdrawal}
              >
                <Text style={styles.primaryButtonText}>{submittingWithdrawal ? 'Requesting…' : 'Request'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <CoinbaseAlert
        visible={alertState.visible}
        title={alertState.title}
        message={alertState.message}
        type={alertState.type}
        onConfirm={() => setAlertState((current) => ({ ...current, visible: false }))}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DARK_BG,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonPressed: {
    transform: [{ scale: 0.96 }],
    opacity: 0.92,
  },
  headerTitle: {
    color: TEXT_PRIMARY,
    fontSize: 20,
    fontFamily: FONTS.heading,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    gap: 16,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
  },
  loadingText: {
    color: TEXT_SECONDARY,
    fontSize: 15,
    fontFamily: FONTS.body,
  },
  emptyTitle: {
    color: TEXT_PRIMARY,
    fontSize: 26,
    textAlign: 'center',
    fontFamily: FONTS.heading,
  },
  heroCard: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 24,
    padding: 22,
    gap: 14,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  heroTitleBlock: {
    flex: 1,
    gap: 4,
  },
  eyebrow: {
    color: BLUE,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontFamily: FONTS.body,
  },
  heroTitle: {
    color: TEXT_PRIMARY,
    fontSize: 30,
    fontFamily: FONTS.heading,
  },
  heroIntro: {
    color: TEXT_PRIMARY,
    fontSize: 16,
    lineHeight: 22,
    fontFamily: FONTS.body,
  },
  heroMeta: {
    color: TEXT_SECONDARY,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONTS.body,
  },
  heroActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  statusBadgeText: {
    fontSize: 12,
    fontFamily: FONTS.body,
  },
  priorityCard: {
    borderRadius: 22,
    padding: 18,
    gap: 8,
  },
  priorityEyebrow: {
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontFamily: FONTS.body,
  },
  priorityTitle: {
    color: TEXT_PRIMARY,
    fontSize: 22,
    lineHeight: 28,
    fontFamily: FONTS.heading,
  },
  priorityBody: {
    color: TEXT_PRIMARY,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONTS.body,
  },
  priorityButton: {
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  priorityButtonText: {
    color: WHITE,
    fontSize: 14,
    fontFamily: FONTS.body,
  },
  card: {
    backgroundColor: CARD_ALT,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 18,
    gap: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  sectionTitleBlock: {
    flex: 1,
  },
  sectionTitle: {
    color: TEXT_PRIMARY,
    fontSize: 22,
    fontFamily: FONTS.heading,
  },
  sectionHint: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FONTS.body,
    marginTop: 4,
  },
  snapshotGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  snapshotTile: {
    flex: 1,
    backgroundColor: WHITE,
    borderRadius: 16,
    padding: 14,
    gap: 6,
  },
  snapshotLabel: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    fontFamily: FONTS.body,
  },
  snapshotValue: {
    color: TEXT_PRIMARY,
    fontSize: 16,
    fontFamily: FONTS.heading,
  },
  paperclipLeadCard: {
    backgroundColor: WHITE,
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  paperclipHeadline: {
    color: TEXT_PRIMARY,
    fontSize: 18,
    lineHeight: 24,
    fontFamily: FONTS.heading,
  },
  paperclipSummary: {
    color: TEXT_SECONDARY,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONTS.body,
  },
  paperclipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  paperclipSignalCard: {
    width: '48.5%',
    backgroundColor: BLUE_WASH,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    gap: 6,
  },
  paperclipSignalLabel: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    fontFamily: FONTS.body,
  },
  paperclipSignalTitle: {
    color: BLUE,
    fontSize: 17,
    lineHeight: 22,
    fontFamily: FONTS.heading,
  },
  paperclipSignalBody: {
    color: TEXT_PRIMARY,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FONTS.body,
  },
  choiceList: {
    gap: 10,
  },
  choiceRow: {
    backgroundColor: WHITE,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  choiceRowPressed: {
    transform: [{ scale: 0.985 }, { translateY: 1 }],
    opacity: 0.96,
  },
  choiceCopy: {
    flex: 1,
  },
  choiceTitle: {
    color: TEXT_PRIMARY,
    fontSize: 16,
    fontFamily: FONTS.heading,
  },
  choiceSubtitle: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    marginTop: 4,
    fontFamily: FONTS.body,
  },
  choiceAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  choiceActionText: {
    color: BLUE,
    fontSize: 13,
    fontFamily: FONTS.body,
  },
  emptyPanel: {
    backgroundColor: WHITE,
    borderRadius: 16,
    padding: 16,
  },
  emptyPanelText: {
    color: TEXT_SECONDARY,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONTS.body,
  },
  pendingCard: {
    backgroundColor: BLUE_WASH,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    gap: 8,
  },
  pendingTitle: {
    color: BLUE,
    fontSize: 16,
    fontFamily: FONTS.heading,
  },
  pendingBody: {
    color: TEXT_PRIMARY,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: FONTS.body,
  },
  primaryButton: {
    backgroundColor: BLUE,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.94,
  },
  disabledButton: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: WHITE,
    fontSize: 14,
    fontFamily: FONTS.body,
  },
  secondaryButton: {
    backgroundColor: WHITE,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: BORDER,
  },
  secondaryButtonPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.94,
  },
  secondaryButtonText: {
    color: TEXT_PRIMARY,
    fontSize: 14,
    fontFamily: FONTS.body,
  },
  timeline: {
    gap: 12,
  },
  timelineRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: BLUE,
    marginTop: 9,
  },
  timelineCard: {
    flex: 1,
    backgroundColor: WHITE,
    borderRadius: 16,
    padding: 14,
    gap: 4,
  },
  timelineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  timelineTitle: {
    flex: 1,
    color: TEXT_PRIMARY,
    fontSize: 16,
    fontFamily: FONTS.heading,
  },
  timelinePill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  timelinePillText: {
    fontSize: 12,
    fontFamily: FONTS.body,
  },
  timelineSubtitle: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    fontFamily: FONTS.body,
  },
  timelineBody: {
    color: TEXT_SECONDARY,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONTS.body,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(49, 85, 105, 0.25)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: CARD_BG,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 24,
    gap: 14,
  },
  modalTitle: {
    color: TEXT_PRIMARY,
    fontSize: 24,
    fontFamily: FONTS.heading,
  },
  modalBody: {
    color: TEXT_SECONDARY,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONTS.body,
  },
  input: {
    backgroundColor: WHITE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: TEXT_PRIMARY,
    fontSize: 18,
    fontFamily: FONTS.body,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
});
