import { StatusPill } from '@/components/agent-surfaces/StatusPill';
import { CoinbaseAlert } from '@/components/ui/CoinbaseAlerts';
import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import {
  PreviewAgentDetail,
  PreviewAgentSummary,
  PreviewRegentManagerDetail,
  PreviewAgentWithdrawal,
} from '@/types/agentPreviews';
import {
  createPreviewTerminalSession,
  fetchPreviewAgent,
  fetchPreviewRegentManager,
  fetchPreviewTerminalSessions,
} from '@/utils/preview/regentPreview';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const { DARK_BG, CARD_BG, CARD_ALT, TEXT_PRIMARY, TEXT_SECONDARY, BLUE, BORDER, WHITE, SUCCESS, DANGER } = COLORS;

const AMBER = '#A3703A';
const AMBER_WASH = '#F2E7DA';
const GREEN_WASH = '#E6F0EA';
const RED_WASH = '#F3E1DD';
const BLUE_WASH = '#E7EEF2';

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

function runtimeCopy(runtimeStatus: PreviewAgentSummary['runtimeStatus']) {
  switch (runtimeStatus) {
    case 'online':
      return 'Live';
    case 'waiting':
      return 'Needs review';
    case 'offline':
      return 'Offline';
  }
}

function runtimeTone(runtimeStatus: PreviewAgentSummary['runtimeStatus']) {
  switch (runtimeStatus) {
    case 'online':
      return { accent: SUCCESS, wash: GREEN_WASH };
    case 'waiting':
      return { accent: AMBER, wash: AMBER_WASH };
    case 'offline':
      return { accent: DANGER, wash: RED_WASH };
  }
}

function withdrawalCopy(status: PreviewAgentWithdrawal['status']) {
  switch (status) {
    case 'requested':
      return 'Queued';
    case 'approved':
      return 'Approved';
    case 'broadcasting':
      return 'Moving';
    case 'confirmed':
      return 'Arrived';
    case 'failed':
      return 'Stopped';
  }
}

function statusTone(status: PreviewAgentWithdrawal['status']) {
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

function rosterReadyCount(regentManager: PreviewRegentManagerDetail | null) {
  if (!regentManager) {
    return 0;
  }

  return regentManager.roster.filter((member) => {
    const lower = member.status.toLowerCase();
    return lower.includes('ready') || lower.includes('online') || lower.includes('track');
  }).length;
}

export default function AgentDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const agentId = typeof params.id === 'string' ? params.id : '';

  const [agent, setAgent] = useState<PreviewAgentDetail | null>(null);
  const [regentManager, setRegentManager] = useState<PreviewRegentManagerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [openingPreview, setOpeningPreview] = useState(false);
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
      const [detail, nextRegentManager] = await Promise.all([
        fetchPreviewAgent(agentId),
        fetchPreviewRegentManager(agentId),
      ]);

      setAgent(detail);
      setRegentManager(nextRegentManager);
    } catch (error) {
      setAlertState({
        visible: true,
        title: 'This operator is unavailable right now',
        message: error instanceof Error ? error.message : 'Try again in a moment.',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useFocusEffect(
    useCallback(() => {
      loadAgent();
    }, [loadAgent])
  );

  const openRegentManager = useCallback(() => {
    if (!agent) {
      return;
    }

    router.push({ pathname: '/agent/[id]/regent-manager' as any, params: { id: agent.id } });
  }, [agent, router]);

  const openTalk = useCallback(async () => {
    if (!agent) {
      return;
    }

    try {
      setOpeningPreview(true);
      const existingSessions = await fetchPreviewTerminalSessions();
      const existingSession = existingSessions.find((session) => session.agentId === agent.id);
      const session = existingSession
        ? existingSession
        : await createPreviewTerminalSession({
            agentId: agent.id,
            agentName: agent.name,
          });

      router.push({ pathname: '/terminal/[id]' as any, params: { id: session.id } });
    } catch (error) {
      setAlertState({
        visible: true,
        title: 'Talk is unavailable right now',
        message: error instanceof Error ? error.message : 'Try again in a moment.',
        type: 'error',
      });
    } finally {
      setOpeningPreview(false);
    }
  }, [agent, router]);

  const runtime = runtimeTone(agent?.runtimeStatus || 'waiting');
  const topGoal = regentManager?.goals[0];
  const nextTask = regentManager?.activeTasks[0];
  const latestEvent = regentManager?.recentEvents[0];
  const latestReturn = agent?.withdrawals[0];
  const teamReady = rosterReadyCount(regentManager);

  const nextAction = useMemo(() => {
    if (!agent) {
      return {
        eyebrow: 'Next move',
        title: 'Open Regent Manager first',
        body: 'Regent Manager gives the quickest read on what changed and what needs attention.',
        cta: 'Open Regent Manager',
        onPress: () => {},
        accent: BLUE,
        wash: BLUE_WASH,
      };
    }

    if (agent.runtimeStatus === 'offline') {
      return {
        eyebrow: 'Next move',
        title: 'Read Regent Manager before you reopen Talk',
        body: 'Start with the company brief, then decide whether this operator needs follow-up or a reset.',
        cta: 'Open Regent Manager',
        onPress: openRegentManager,
        accent: DANGER,
        wash: RED_WASH,
      };
    }

    if (agent.runtimeStatus === 'waiting') {
      return {
        eyebrow: 'Next move',
        title: 'A decision is waiting in Talk',
        body: 'Hermes is paused until you clear the open review or respond to the latest request.',
        cta: 'Open Talk',
        onPress: openTalk,
        accent: AMBER,
        wash: AMBER_WASH,
      };
    }

    return {
      eyebrow: 'Next move',
      title: 'Talk is the fastest way back in',
      body: 'Jump into the conversation to see what Hermes finished, what changed, and what comes next.',
      cta: 'Open Talk',
      onPress: openTalk,
      accent: SUCCESS,
      wash: GREEN_WASH,
    };
  }, [agent, openRegentManager, openTalk]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={BLUE} />
          <Text style={styles.loadingText}>Loading operator view…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!agent) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerState}>
          <Text style={styles.emptyTitle}>This operator is unavailable</Text>
          <Pressable style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]} onPress={() => router.back()}>
            <Text style={styles.primaryButtonText}>Back</Text>
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

      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.scrollContent}>
        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View style={styles.heroTitleBlock}>
              <Text style={styles.eyebrow}>Regents operator</Text>
              <Text style={styles.heroTitle}>{agent.name}</Text>
            </View>
            <StatusPill
              label={runtimeCopy(agent.runtimeStatus)}
              color={runtime.accent}
              backgroundColor={runtime.wash}
              showDot
            />
          </View>
          <Text style={styles.heroIntro}>{agent.runtimeHeadline}</Text>
          <Text style={styles.heroMeta}>{agent.mission}</Text>
          <View style={styles.heroActions}>
            <Pressable
              style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
              onPress={openTalk}
            >
              <Text style={styles.primaryButtonText}>{openingPreview ? 'Opening…' : 'Open Talk'}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
              onPress={openRegentManager}
            >
              <Text style={styles.secondaryButtonText}>Open Regent Manager</Text>
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
          <Text style={styles.sectionTitle}>Operator view</Text>
          <Text style={styles.sectionHint}>The essentials for this operator without leaving the phone.</Text>
          <View style={styles.overviewGrid}>
            <View style={styles.overviewTile}>
              <Text style={styles.overviewLabel}>Cash on hand</Text>
              <Text selectable style={styles.overviewValue}>
                {agent.stablecoinSymbol} {formatCurrency(agent.stablecoinBalance)}
              </Text>
              <Text style={styles.overviewMeta}>Ready balance</Text>
            </View>
            <View style={styles.overviewTile}>
              <Text style={styles.overviewLabel}>Wallet</Text>
              <Text selectable style={styles.overviewValue}>
                {formatAddress(agent.walletAddress)}
              </Text>
              <Text style={styles.overviewMeta}>Operator address</Text>
            </View>
            <View style={styles.overviewTile}>
              <Text style={styles.overviewLabel}>Last active</Text>
              <Text style={styles.overviewValue}>{formatRelativeTime(agent.lastActiveAt)}</Text>
              <Text style={styles.overviewMeta}>Most recent movement</Text>
            </View>
            <View style={styles.overviewTile}>
              <Text style={styles.overviewLabel}>Team ready</Text>
              <Text style={styles.overviewValue}>
                {regentManager ? `${teamReady}/${regentManager.roster.length}` : '0/0'}
              </Text>
              <Text style={styles.overviewMeta}>Ready to move now</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleBlock}>
              <Text style={styles.sectionTitle}>Regent Manager</Text>
              <Text style={styles.sectionHint}>The short company brief tied to this operator.</Text>
            </View>
            <Pressable style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]} onPress={openRegentManager}>
              <Text style={styles.secondaryButtonText}>Open</Text>
            </Pressable>
          </View>

          {regentManager ? (
            <>
              <View style={styles.regentManagerLeadCard}>
                <Text style={styles.regentManagerHeadline}>{regentManager.headline}</Text>
                <Text style={styles.regentManagerSummary}>{regentManager.companySummary}</Text>
              </View>
              <View style={styles.regentManagerGrid}>
                <View style={styles.regentManagerSignalCard}>
                  <Text style={styles.regentManagerSignalLabel}>Focus now</Text>
                  <Text style={styles.regentManagerSignalTitle}>{nextTask?.title || topGoal?.title || 'No open focus yet'}</Text>
                  <Text style={styles.regentManagerSignalBody}>{nextTask?.status || topGoal?.status || 'Waiting for the next update'}</Text>
                </View>
                <View style={styles.regentManagerSignalCard}>
                  <Text style={styles.regentManagerSignalLabel}>Latest shift</Text>
                  <Text style={styles.regentManagerSignalTitle}>{latestEvent?.title || 'No recent change yet'}</Text>
                  <Text style={styles.regentManagerSignalBody}>{latestEvent ? formatRelativeTime(latestEvent.at) : 'Waiting for the next update'}</Text>
                </View>
                <View style={styles.regentManagerSignalCard}>
                  <Text style={styles.regentManagerSignalLabel}>Top goal</Text>
                  <Text style={styles.regentManagerSignalTitle}>{topGoal?.title || 'No top goal yet'}</Text>
                  <Text style={styles.regentManagerSignalBody}>{topGoal?.status || 'No status yet'}</Text>
                </View>
                <View style={styles.regentManagerSignalCard}>
                  <Text style={styles.regentManagerSignalLabel}>Team ready</Text>
                  <Text style={styles.regentManagerSignalTitle}>{teamReady}/{regentManager.roster.length}</Text>
                  <Text style={styles.regentManagerSignalBody}>People ready to move</Text>
                </View>
              </View>
            </>
          ) : (
            <View style={styles.emptyPanel}>
              <Text style={styles.emptyPanelText}>Regent Manager is empty right now.</Text>
            </View>
          )}
        </View>

        {agent.withdrawals.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Recent returns</Text>
            <Text style={styles.sectionHint}>Where funds were headed most recently.</Text>
            <View style={styles.timeline}>
              {agent.withdrawals.slice(0, 3).map((withdrawal) => {
                const tone = statusTone(withdrawal.status);
                return (
                  <View key={withdrawal.id} style={styles.timelineRow}>
                    <View style={[styles.timelineDot, { backgroundColor: tone.accent }]} />
                    <View style={styles.timelineCard}>
                      <View style={styles.timelineHeader}>
                        <Text style={styles.timelineTitle}>
                          {withdrawal.amount} {withdrawal.currency}
                        </Text>
                        <View style={[styles.timelinePill, { backgroundColor: tone.wash }]}>
                          <Text style={[styles.timelinePillText, { color: tone.accent }]}>{withdrawalCopy(withdrawal.status)}</Text>
                        </View>
                      </View>
                      <Text style={styles.timelineSubtitle}>{new Date(withdrawal.updatedAt).toLocaleString()}</Text>
                      <Text selectable style={styles.timelineBody}>
                        To {formatAddress(withdrawal.destinationWalletAddress)}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
            {latestReturn ? <Text style={styles.sectionNote}>Most recent return shown first.</Text> : null}
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Recent movement</Text>
          <Text style={styles.sectionHint}>The latest operator updates across Talk, tasks, and money movement.</Text>
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
    gap: 10,
    flexWrap: 'wrap',
  },
  primaryButton: {
    backgroundColor: BLUE,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
  primaryButtonText: {
    color: WHITE,
    fontSize: 14,
    fontFamily: FONTS.body,
  },
  secondaryButton: {
    backgroundColor: WHITE,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonPressed: {
    opacity: 0.95,
    transform: [{ scale: 0.99 }],
  },
  secondaryButtonText: {
    color: TEXT_PRIMARY,
    fontSize: 14,
    fontFamily: FONTS.body,
  },
  priorityCard: {
    borderRadius: 24,
    padding: 20,
    gap: 10,
  },
  priorityEyebrow: {
    fontSize: 12,
    textTransform: 'uppercase',
    fontFamily: FONTS.body,
  },
  priorityTitle: {
    color: TEXT_PRIMARY,
    fontSize: 24,
    fontFamily: FONTS.heading,
  },
  priorityBody: {
    color: TEXT_PRIMARY,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONTS.body,
  },
  priorityButton: {
    alignSelf: 'flex-start',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  priorityButtonText: {
    color: WHITE,
    fontSize: 14,
    fontFamily: FONTS.body,
  },
  card: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 24,
    padding: 20,
    gap: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionTitleBlock: {
    flex: 1,
    gap: 4,
  },
  sectionTitle: {
    color: TEXT_PRIMARY,
    fontSize: 22,
    fontFamily: FONTS.heading,
  },
  sectionHint: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: FONTS.body,
  },
  sectionNote: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    fontFamily: FONTS.body,
  },
  overviewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  overviewTile: {
    width: '48%',
    backgroundColor: CARD_ALT,
    borderRadius: 18,
    padding: 16,
    gap: 6,
  },
  overviewLabel: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    textTransform: 'uppercase',
    fontFamily: FONTS.body,
  },
  overviewValue: {
    color: TEXT_PRIMARY,
    fontSize: 16,
    lineHeight: 22,
    fontFamily: FONTS.heading,
  },
  overviewMeta: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FONTS.body,
  },
  regentManagerLeadCard: {
    backgroundColor: CARD_ALT,
    borderRadius: 18,
    padding: 16,
    gap: 8,
  },
  regentManagerHeadline: {
    color: TEXT_PRIMARY,
    fontSize: 18,
    lineHeight: 24,
    fontFamily: FONTS.heading,
  },
  regentManagerSummary: {
    color: TEXT_SECONDARY,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONTS.body,
  },
  regentManagerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  regentManagerSignalCard: {
    width: '48%',
    backgroundColor: CARD_ALT,
    borderRadius: 18,
    padding: 16,
    gap: 6,
  },
  regentManagerSignalLabel: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    fontFamily: FONTS.body,
  },
  regentManagerSignalTitle: {
    color: TEXT_PRIMARY,
    fontSize: 16,
    lineHeight: 22,
    fontFamily: FONTS.heading,
  },
  regentManagerSignalBody: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FONTS.body,
  },
  emptyPanel: {
    backgroundColor: CARD_ALT,
    borderRadius: 18,
    padding: 16,
  },
  emptyPanelText: {
    color: TEXT_SECONDARY,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONTS.body,
  },
  timeline: {
    gap: 12,
  },
  timelineRow: {
    flexDirection: 'row',
    gap: 12,
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 8,
    backgroundColor: BLUE,
  },
  timelineCard: {
    flex: 1,
    backgroundColor: CARD_ALT,
    borderRadius: 18,
    padding: 14,
    gap: 4,
  },
  timelineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  timelineTitle: {
    color: TEXT_PRIMARY,
    fontSize: 15,
    fontFamily: FONTS.heading,
  },
  timelineSubtitle: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    fontFamily: FONTS.body,
  },
  timelineBody: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FONTS.body,
  },
  timelinePill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  timelinePillText: {
    fontSize: 11,
    fontFamily: FONTS.body,
  },
});
