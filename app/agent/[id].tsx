import { StatusPill } from '@/components/agent-surfaces/StatusPill';
import { LiveValueFlash } from '@/components/motion/LiveValueFlash';
import { SpinningRefreshIcon } from '@/components/motion/SpinningRefreshIcon';
import { CoinbaseAlert } from '@/components/ui/CoinbaseAlerts';
import { RegentPressable } from '@/components/ui/RegentPressable';
import { HermesVoiceButton } from '@/components/voice/HermesVoiceButton';
import { HermesVoiceSheet } from '@/components/voice/HermesVoiceSheet';
import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import {
  RegentDetail,
  RegentManagerDetail,
  RegentReturnRequest,
  RegentSummary,
} from '@/types/regents';
import { routes } from '@/utils/navigation/routes';
import { regentApi } from '@/utils/regentApi/client';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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

function formatRelativeTime(dateString: string) {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const diffMinutes = Math.max(1, Math.round(diffMs / 60000));
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.round(diffHours / 24)}d ago`;
}

function formatDateShort(dateString: string) {
  return new Date(dateString).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function platformStatusCopy(value: string) {
  return value
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function runtimeCopy(runtimeStatus: RegentSummary['runtimeStatus']) {
  switch (runtimeStatus) {
    case 'online':
      return 'Live';
    case 'waiting':
      return 'Needs approval';
    case 'offline':
      return 'Offline';
  }
}

function runtimeTone(runtimeStatus: RegentSummary['runtimeStatus']) {
  switch (runtimeStatus) {
    case 'online':
      return { accent: SUCCESS, wash: GREEN_WASH };
    case 'waiting':
      return { accent: AMBER, wash: AMBER_WASH };
    case 'offline':
      return { accent: DANGER, wash: RED_WASH };
  }
}

function returnRequestCopy(status: RegentReturnRequest['status']) {
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

function statusTone(status: RegentReturnRequest['status']) {
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

function rosterReadyCount(regentManager: RegentManagerDetail | null) {
  if (!regentManager) {
    return 0;
  }

  return regentManager.roster.filter((member) => {
    const lower = member.status.toLowerCase();
    return lower.includes('ready') || lower.includes('online') || lower.includes('track');
  }).length;
}

type NextAction = {
  eyebrow: string;
  title: string;
  body: string;
  cta: string;
  onPress?: () => void;
  disabled?: boolean;
  accent: string;
  wash: string;
};

export default function AgentDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const agentId = typeof params.id === 'string' ? params.id : '';

  const [agent, setAgent] = useState<RegentDetail | null>(null);
  const [regentManager, setRegentManager] = useState<RegentManagerDetail | null>(null);
  const [voiceSheetOpen, setVoiceSheetOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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

  const loadAgent = useCallback(async (refresh = false) => {
    if (!agentId) {
      return;
    }

    try {
      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      const [detail, nextRegentManager] = await Promise.all([
        regentApi.getRegent(agentId),
        regentApi.getRegentManager(agentId),
      ]);

      setAgent(detail);
      setRegentManager(nextRegentManager);
    } catch (error) {
      setAlertState({
        visible: true,
        title: 'This agent is unavailable right now',
        message: error instanceof Error ? error.message : 'Try again in a moment.',
        type: 'error',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
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

    router.push(routes.regentManager(agent.id));
  }, [agent, router]);

  const openTalk = useCallback(() => {
    router.push(routes.terminal());
  }, [router]);

  const openVoice = useCallback(() => {
    setVoiceSheetOpen(true);
  }, []);

  const openFundAgent = useCallback(() => {
    if (!agent) {
      return;
    }

    router.push(routes.walletSend({
      flow: 'agent-funding',
      regentId: agent.id,
      recipientAddress: agent.walletAddress,
      recipientLabel: agent.name,
    }));
  }, [agent, router]);

  const runtime = runtimeTone(agent?.runtimeStatus || 'waiting');
  const topGoal = regentManager?.goals[0];
  const nextTask = regentManager?.activeTasks[0];
  const latestEvent = regentManager?.recentEvents[0];
  const latestReturn = agent?.returnRequests[0];
  const teamReady = rosterReadyCount(regentManager);

  const nextAction = useMemo<NextAction>(() => {
    if (!agent) {
      return {
        eyebrow: 'Next move',
        title: 'Check this agent first',
        body: 'The agent brief gives the quickest read on what changed and what needs attention.',
        cta: 'Open Agent Brief',
        disabled: true,
        accent: BLUE,
        wash: BLUE_WASH,
      };
    }

    if (agent.runtimeStatus === 'offline') {
      return {
        eyebrow: 'Next move',
        title: 'Start with the agent brief',
        body: 'Read the brief, then decide whether this agent needs follow-up.',
        cta: 'Open Agent Brief',
        onPress: openRegentManager,
        accent: DANGER,
        wash: RED_WASH,
      };
    }

    if (agent.runtimeStatus === 'waiting') {
      return {
        eyebrow: 'Next move',
        title: 'Message this agent',
        body: 'Reply to messages, payment requests, and decisions for this agent.',
        cta: 'Message',
        onPress: openTalk,
        accent: AMBER,
        wash: AMBER_WASH,
      };
    }

    return {
      eyebrow: 'Next move',
      title: 'Fund this agent',
      body: 'Add USDC to the working balance so this agent can pay for tools, services, and work.',
      cta: 'Fund Agent',
      onPress: openFundAgent,
      accent: SUCCESS,
      wash: GREEN_WASH,
    };
  }, [agent, openFundAgent, openRegentManager, openTalk]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={BLUE} />
          <Text style={styles.loadingText}>Loading agent view...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!agent) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerState}>
          <Text style={styles.emptyTitle}>This agent is unavailable</Text>
          <RegentPressable style={styles.primaryButton} onPress={() => router.back()}>
            <Text style={styles.primaryButtonText}>Back</Text>
          </RegentPressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <RegentPressable pressStyle="icon" onPress={() => router.back()} style={styles.iconButton}>
          <Ionicons name="chevron-back" size={22} color={TEXT_PRIMARY} />
        </RegentPressable>
        <Text style={styles.headerTitle}>{agent.name}</Text>
        <RegentPressable pressStyle="icon" onPress={() => loadAgent(true)} disabled={refreshing} style={styles.iconButton}>
          <SpinningRefreshIcon refreshing={refreshing} size={18} color={BLUE} />
        </RegentPressable>
      </View>

      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.scrollContent}>
        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View style={styles.heroTitleBlock}>
              <Text style={styles.eyebrow}>Agent</Text>
              <Text style={styles.heroTitle}>{agent.name}</Text>
            </View>
            <StatusPill
              label={runtimeCopy(agent.runtimeStatus)}
              color={runtime.accent}
              backgroundColor={runtime.wash}
              showDot={agent.runtimeStatus === 'online'}
            />
          </View>
          <Text style={styles.heroIntro}>{agent.runtimeHeadline}</Text>
          <Text style={styles.heroMeta}>{agent.mission}</Text>
          <View style={styles.heroActions}>
            <RegentPressable
              style={styles.primaryButton}
              onPress={openFundAgent}
            >
              <Text style={styles.primaryButtonText}>Fund Agent</Text>
            </RegentPressable>
            <RegentPressable
              style={styles.secondaryButton}
              onPress={openTalk}
            >
              <Text style={styles.secondaryButtonText}>Message Agent</Text>
            </RegentPressable>
          </View>
          <HermesVoiceButton voice={agent.voice} onPress={openVoice} />
        </View>

        <View style={[styles.priorityCard, { backgroundColor: nextAction.wash }]}>
          <Text style={[styles.priorityEyebrow, { color: nextAction.accent }]}>{nextAction.eyebrow}</Text>
          <Text style={styles.priorityTitle}>{nextAction.title}</Text>
          <Text style={styles.priorityBody}>{nextAction.body}</Text>
          <RegentPressable
            disabled={nextAction.disabled}
            accessibilityState={{ disabled: nextAction.disabled }}
            style={[
              styles.priorityButton,
              { backgroundColor: nextAction.accent },
              nextAction.disabled && styles.priorityButtonDisabled,
            ]}
            onPress={nextAction.onPress}
          >
            <Text style={styles.priorityButtonText}>{nextAction.cta}</Text>
          </RegentPressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Agent status</Text>
          <Text style={styles.sectionHint}>Name, setup, plan, and current status for this agent.</Text>
          <View style={styles.overviewGrid}>
            <View style={styles.overviewTile}>
              <Text style={styles.overviewLabel}>Name</Text>
              <Text selectable style={styles.overviewValue}>
                {agent.platformState.claimedName}
              </Text>
              <Text style={styles.overviewMeta}>{agent.platformState.slug}</Text>
            </View>
            <View style={styles.overviewTile}>
              <Text style={styles.overviewLabel}>Setup</Text>
              <Text style={styles.overviewValue}>{platformStatusCopy(agent.platformState.formationStatus)}</Text>
              <Text style={styles.overviewMeta}>
                {agent.platformState.blockers.length > 0 ? agent.platformState.blockers[0] : 'Ready to use'}
              </Text>
            </View>
            <View style={styles.overviewTile}>
              <Text style={styles.overviewLabel}>Plan</Text>
              <Text style={styles.overviewValue}>{platformStatusCopy(agent.platformState.billingStatus)}</Text>
              <Text style={styles.overviewMeta}>
                {agent.platformState.prepaidBalanceUsd ? `$${agent.platformState.prepaidBalanceUsd} working balance` : 'Balance not listed'}
              </Text>
            </View>
            <View style={styles.overviewTile}>
              <Text style={styles.overviewLabel}>Status</Text>
              <Text style={styles.overviewValue}>{platformStatusCopy(agent.platformState.runtimeStatus)}</Text>
              <Text style={styles.overviewMeta}>
                {agent.platformState.nextPauseAt ? `Next check ${formatDateShort(agent.platformState.nextPauseAt)}` : 'No pause scheduled'}
              </Text>
            </View>
            <View style={styles.overviewTile}>
              <Text style={styles.overviewLabel}>Working balance</Text>
              <LiveValueFlash value={`account-credit-${agent.platformState.prepaidBalanceUsd || 'not-listed'}`}>
                <Text selectable style={styles.overviewValue}>
                  {agent.platformState.prepaidBalanceUsd ? `$${agent.platformState.prepaidBalanceUsd}` : 'Not listed'}
                </Text>
              </LiveValueFlash>
              <Text style={styles.overviewMeta}>USDC available for work</Text>
            </View>
            <View style={styles.overviewTile}>
              <Text style={styles.overviewLabel}>Agent wallet</Text>
              <Text selectable style={styles.overviewValue}>
                {formatAddress(agent.walletAddress)}
              </Text>
              <Text style={styles.overviewMeta}>Payment destination</Text>
            </View>
            <View style={styles.overviewTile}>
              <Text style={styles.overviewLabel}>Last active</Text>
              <LiveValueFlash value={`last-active-${formatRelativeTime(agent.lastActiveAt)}`}>
                <Text style={styles.overviewValue}>{formatRelativeTime(agent.lastActiveAt)}</Text>
              </LiveValueFlash>
              <Text style={styles.overviewMeta}>Most recent update</Text>
            </View>
            <View style={styles.overviewTile}>
              <Text style={styles.overviewLabel}>Team ready</Text>
              <LiveValueFlash value={`team-ready-${regentManager ? `${teamReady}/${regentManager.roster.length}` : '0/0'}`}>
                <Text style={styles.overviewValue}>
                  {regentManager ? `${teamReady}/${regentManager.roster.length}` : '0/0'}
                </Text>
              </LiveValueFlash>
              <Text style={styles.overviewMeta}>Ready to move now</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleBlock}>
              <Text style={styles.sectionTitle}>Agent Brief</Text>
              <Text style={styles.sectionHint}>The short company brief tied to this agent.</Text>
            </View>
            <RegentPressable style={styles.secondaryButton} onPress={openRegentManager}>
              <Text style={styles.secondaryButtonText}>Open</Text>
            </RegentPressable>
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
                  <LiveValueFlash value={`focus-${nextTask?.title || topGoal?.title || 'No open focus yet'}`}>
                    <Text style={styles.regentManagerSignalTitle}>{nextTask?.title || topGoal?.title || 'No open focus yet'}</Text>
                  </LiveValueFlash>
                  <Text style={styles.regentManagerSignalBody}>{nextTask?.status || topGoal?.status || 'Waiting for the next update'}</Text>
                </View>
                <View style={styles.regentManagerSignalCard}>
                  <Text style={styles.regentManagerSignalLabel}>Latest shift</Text>
                  <LiveValueFlash value={`latest-${latestEvent?.title || 'No recent change yet'}`}>
                    <Text style={styles.regentManagerSignalTitle}>{latestEvent?.title || 'No recent change yet'}</Text>
                  </LiveValueFlash>
                  <Text style={styles.regentManagerSignalBody}>{latestEvent ? formatRelativeTime(latestEvent.at) : 'Waiting for the next update'}</Text>
                </View>
                <View style={styles.regentManagerSignalCard}>
                  <Text style={styles.regentManagerSignalLabel}>Top goal</Text>
                  <LiveValueFlash value={`goal-${topGoal?.title || 'No top goal yet'}`}>
                    <Text style={styles.regentManagerSignalTitle}>{topGoal?.title || 'No top goal yet'}</Text>
                  </LiveValueFlash>
                  <Text style={styles.regentManagerSignalBody}>{topGoal?.status || 'No status yet'}</Text>
                </View>
                <View style={styles.regentManagerSignalCard}>
                  <Text style={styles.regentManagerSignalLabel}>Team ready</Text>
                  <LiveValueFlash value={`manager-ready-${teamReady}/${regentManager.roster.length}`}>
                    <Text style={styles.regentManagerSignalTitle}>{teamReady}/{regentManager.roster.length}</Text>
                  </LiveValueFlash>
                  <Text style={styles.regentManagerSignalBody}>People ready to move</Text>
                </View>
              </View>
            </>
          ) : (
            <View style={styles.emptyPanel}>
              <Text style={styles.emptyPanelText}>Agent Brief is empty right now.</Text>
            </View>
          )}
        </View>

        {agent.returnRequests.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Recent returns</Text>
            <Text style={styles.sectionHint}>Where funds were headed most recently.</Text>
            <View style={styles.timeline}>
              {agent.returnRequests.slice(0, 3).map((returnRequest) => {
                const tone = statusTone(returnRequest.status);
                return (
                  <View key={returnRequest.id} style={styles.timelineRow}>
                    <View style={[styles.timelineDot, { backgroundColor: tone.accent }]} />
                    <View style={styles.timelineCard}>
                      <View style={styles.timelineHeader}>
                        <Text style={styles.timelineTitle}>
                          {returnRequest.amount} {returnRequest.currency}
                        </Text>
                        <View style={[styles.timelinePill, { backgroundColor: tone.wash }]}>
                          <Text style={[styles.timelinePillText, { color: tone.accent }]}>{returnRequestCopy(returnRequest.status)}</Text>
                        </View>
                      </View>
                      <Text style={styles.timelineSubtitle}>{new Date(returnRequest.updatedAt).toLocaleString()}</Text>
                      <Text selectable style={styles.timelineBody}>
                        To {formatAddress(returnRequest.destinationWalletAddress)}
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
          <Text style={styles.sectionHint}>The latest agent updates across tasks and payments.</Text>
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
      <HermesVoiceSheet
        agentId={agent.id}
        agentName={agent.name}
        visible={voiceSheetOpen}
        onClose={() => setVoiceSheetOpen(false)}
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
    flex: 1,
    minWidth: 0,
    color: TEXT_PRIMARY,
    fontSize: 20,
    lineHeight: 24,
    textAlign: 'center',
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
    flexWrap: 'wrap',
    gap: 12,
  },
  heroTitleBlock: {
    flex: 1,
    minWidth: 0,
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
    minWidth: 120,
    backgroundColor: BLUE,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: WHITE,
    fontSize: 14,
    fontFamily: FONTS.body,
  },
  secondaryButton: {
    minWidth: 120,
    backgroundColor: WHITE,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
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
  priorityButtonDisabled: {
    opacity: 0.72,
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
    flexBasis: '47%',
    flexGrow: 1,
    minWidth: 142,
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
    flexBasis: '47%',
    flexGrow: 1,
    minWidth: 142,
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
    flexWrap: 'wrap',
    gap: 10,
  },
  timelineTitle: {
    flex: 1,
    minWidth: 0,
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
