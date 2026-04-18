import { CoinbaseAlert } from '@/components/ui/CoinbaseAlerts';
import { COLORS } from '@/constants/Colors';
import { TEST_ACCOUNTS } from '@/constants/TestAccounts';
import { FONTS } from '@/constants/Typography';
import { createAgentWithdrawal } from '@/utils/createAgentWithdrawal';
import { createTerminalSession } from '@/utils/createTerminalSession';
import { fetchAgent } from '@/utils/fetchAgent';
import { fetchAgentPaperclip } from '@/utils/fetchAgentPaperclip';
import { fetchTerminalSessions } from '@/utils/fetchTerminalSessions';
import { fetchWalletFundingChoices } from '@/utils/fetchWalletFundingChoices';
import { clearPendingAgentFundings, getPendingAgentFundings, getTestWalletSol, isTestSessionActive } from '@/utils/sharedState';
import { AgentDetail, AgentSummary, AgentWithdrawal, PaperclipDetail, WalletFundingChoice } from '@/types/agents';
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

const { DARK_BG, CARD_BG, CARD_ALT, TEXT_PRIMARY, TEXT_SECONDARY, BLUE, BORDER, WHITE, BLUE_WASH } = COLORS;

function formatAddress(address: string) {
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

function formatCurrency(amount: string) {
  return Number(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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

  const openTerminal = async () => {
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
  };

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
          <Pressable style={styles.primaryButton} onPress={() => router.back()}>
            <Text style={styles.primaryButtonText}>Back to agents</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconButton}>
          <Ionicons name="chevron-back" size={22} color={TEXT_PRIMARY} />
        </Pressable>
        <Text style={styles.headerTitle}>{agent.name}</Text>
        <Pressable onPress={loadAgent} style={styles.iconButton}>
          <Ionicons name="refresh" size={18} color={BLUE} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View>
              <Text style={styles.eyebrow}>Agent treasury</Text>
              <Text style={styles.heroTitle}>{agent.name}</Text>
            </View>
            <View style={styles.statusBadge}>
              <Text style={styles.statusBadgeText}>{runtimeCopy(agent.runtimeStatus)}</Text>
            </View>
          </View>
          <Text style={styles.heroIntro}>{agent.runtimeHeadline}</Text>
          <Text style={styles.heroMeta}>{agent.mission}</Text>
          {agentIsOffline ? (
            <View style={styles.warningCard}>
              <Text style={styles.warningTitle}>This agent is offline</Text>
              <Text style={styles.warningBody}>Terminal access and withdrawal requests will be available again once the agent comes back online.</Text>
            </View>
          ) : null}
          <View style={styles.heroActions}>
            <Pressable style={[styles.primaryButton, (!canOpenTerminal || openingTerminal) && styles.disabledButton]} onPress={openTerminal} disabled={!canOpenTerminal || openingTerminal}>
              <Text style={styles.primaryButtonText}>{openingTerminal ? 'Opening…' : 'Open terminal'}</Text>
            </Pressable>
            <Pressable
              style={[styles.secondaryButton, agentIsOffline && styles.disabledButton]}
              onPress={() => router.push({ pathname: '/agent/[id]/paperclip' as any, params: { id: agent.id } })}
            >
              <Text style={styles.secondaryButtonText}>Paperclip</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Paperclip</Text>
              <Text style={styles.sectionHint}>A quick mobile summary of this agent’s current picture.</Text>
            </View>
            <Pressable
              style={styles.secondaryButton}
              onPress={() => router.push({ pathname: '/agent/[id]/paperclip' as any, params: { id: agent.id } })}
            >
              <Text style={styles.secondaryButtonText}>Open</Text>
            </Pressable>
          </View>

          {paperclip ? (
            <>
              <View style={styles.paperclipCard}>
                <Text style={styles.paperclipHeadline}>{paperclip.headline}</Text>
                <Text style={styles.paperclipSummary}>{paperclip.companySummary}</Text>
              </View>
              <View style={styles.paperclipStats}>
                <View style={styles.paperclipStatTile}>
                  <Text style={styles.paperclipStatLabel}>Goals</Text>
                  <Text style={styles.paperclipStatValue}>{paperclip.goals.length}</Text>
                </View>
                <View style={styles.paperclipStatTile}>
                  <Text style={styles.paperclipStatLabel}>Active tasks</Text>
                  <Text style={styles.paperclipStatValue}>{paperclip.activeTasks.length}</Text>
                </View>
                <View style={styles.paperclipStatTile}>
                  <Text style={styles.paperclipStatLabel}>Team</Text>
                  <Text style={styles.paperclipStatValue}>{paperclip.roster.length}</Text>
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
          <Text style={styles.sectionTitle}>Treasury snapshot</Text>
          <View style={styles.snapshotGrid}>
            <View style={styles.snapshotTile}>
              <Text style={styles.snapshotLabel}>Stablecoin balance</Text>
              <Text style={styles.snapshotValue}>{agent.stablecoinSymbol} {formatCurrency(agent.stablecoinBalance)}</Text>
            </View>
            <View style={styles.snapshotTile}>
              <Text style={styles.snapshotLabel}>Wallet</Text>
              <Text style={styles.snapshotValue}>{formatAddress(agent.walletAddress)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <View>
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
                  <Pressable key={`${choice.network}-${choice.token?.symbol}-${choice.token?.contractAddress || choice.token?.mintAddress || 'native'}`} style={styles.choiceRow} onPress={() => startFunding(choice)}>
                    <View>
                      <Text style={styles.choiceTitle}>{choice.token?.symbol || 'Token'} on {choice.network}</Text>
                      <Text style={styles.choiceSubtitle}>{normalizedAmount.toFixed(2)} available</Text>
                    </View>
                    <Ionicons name="arrow-forward" size={18} color={BLUE} />
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Request a withdrawal</Text>
              <Text style={styles.sectionHint}>Ask this agent to return funds to your mobile wallet.</Text>
            </View>
            <Pressable
              style={[styles.primaryButton, !canRequestWithdrawal && styles.disabledButton]}
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
              {agent.withdrawals.map((withdrawal) => (
                <View key={withdrawal.id} style={styles.timelineRow}>
                  <View style={styles.timelineDot} />
                  <View style={styles.timelineCard}>
                    <Text style={styles.timelineTitle}>{withdrawal.amount} {withdrawal.currency}</Text>
                    <Text style={styles.timelineSubtitle}>{withdrawalCopy(withdrawal.status)} • {new Date(withdrawal.updatedAt).toLocaleString()}</Text>
                    <Text style={styles.timelineBody}>Returning to {formatAddress(withdrawal.destinationWalletAddress)}</Text>
                  </View>
                </View>
              ))}
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
              <Pressable style={styles.secondaryButton} onPress={() => {
                setWithdrawalModalVisible(false);
                setWithdrawalIntentKey(null);
              }}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.primaryButton} onPress={submitWithdrawal} disabled={submittingWithdrawal}>
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
    fontFamily: FONTS.heading,
  },
  heroCard: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 24,
    padding: 22,
    gap: 12,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
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
    justifyContent: 'flex-start',
    gap: 10,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: BLUE_WASH,
    borderWidth: 1,
    borderColor: BORDER,
  },
  statusBadgeText: {
    color: BLUE,
    fontSize: 12,
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
    alignItems: 'center',
    gap: 12,
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
  paperclipCard: {
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
  paperclipStats: {
    flexDirection: 'row',
    gap: 10,
  },
  paperclipStatTile: {
    flex: 1,
    backgroundColor: BLUE_WASH,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    gap: 6,
  },
  paperclipStatLabel: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    fontFamily: FONTS.body,
  },
  paperclipStatValue: {
    color: BLUE,
    fontSize: 18,
    fontFamily: FONTS.heading,
  },
  warningCard: {
    backgroundColor: '#F2E7DA',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    gap: 6,
  },
  warningTitle: {
    color: '#A3703A',
    fontSize: 16,
    fontFamily: FONTS.heading,
  },
  warningBody: {
    color: TEXT_PRIMARY,
    fontSize: 13,
    lineHeight: 19,
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
  timelineTitle: {
    color: TEXT_PRIMARY,
    fontSize: 16,
    fontFamily: FONTS.heading,
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
