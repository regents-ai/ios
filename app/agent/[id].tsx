import { CoinbaseAlert } from '@/components/ui/CoinbaseAlerts';
import { PreviewNotice } from '@/components/ui/PreviewNotice';
import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import {
  PreviewAgentDetail,
  PreviewAgentSummary,
  PreviewPaperclipDetail,
  PreviewAgentWithdrawal,
} from '@/types/agentPreviews';
import { createPreviewTerminalSession } from '@/utils/createPreviewTerminalSession';
import { fetchPreviewAgent } from '@/utils/fetchPreviewAgent';
import { fetchPreviewPaperclip } from '@/utils/fetchPreviewPaperclip';
import { fetchPreviewTerminalSessions } from '@/utils/fetchPreviewTerminalSessions';
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

function runtimeCopy(runtimeStatus: PreviewAgentSummary['runtimeStatus']) {
  switch (runtimeStatus) {
    case 'online':
      return 'Online example';
    case 'waiting':
      return 'Review example';
    case 'offline':
      return 'Offline example';
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
      return 'Shown';
    case 'approved':
      return 'Approved example';
    case 'broadcasting':
      return 'Moving example';
    case 'confirmed':
      return 'Completed example';
    case 'failed':
      return 'Stopped example';
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

function rosterReadyCount(paperclip: PreviewPaperclipDetail | null) {
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

  const [agent, setAgent] = useState<PreviewAgentDetail | null>(null);
  const [paperclip, setPaperclip] = useState<PreviewPaperclipDetail | null>(null);
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
      const [detail, nextPaperclip] = await Promise.all([
        fetchPreviewAgent(agentId),
        fetchPreviewPaperclip(agentId),
      ]);

      setAgent(detail);
      setPaperclip(nextPaperclip);
    } catch (error) {
      setAlertState({
        visible: true,
        title: 'Unable to load this preview',
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

  const openPaperclip = useCallback(() => {
    if (!agent) {
      return;
    }

    router.push({ pathname: '/agent/[id]/paperclip' as any, params: { id: agent.id } });
  }, [agent, router]);

  const openPreviewSession = useCallback(async () => {
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
        title: 'Unable to open the preview',
        message: error instanceof Error ? error.message : 'Try again in a moment.',
        type: 'error',
      });
    } finally {
      setOpeningPreview(false);
    }
  }, [agent, router]);

  const runtime = runtimeTone(agent?.runtimeStatus || 'waiting');
  const topGoal = paperclip?.goals[0];
  const nextTask = paperclip?.activeTasks[0];
  const latestEvent = paperclip?.recentEvents[0];
  const teamReady = rosterReadyCount(paperclip);

  const nextAction = useMemo(() => {
    if (!agent) {
      return {
        eyebrow: 'Preview',
        title: 'Review this sample card',
        body: 'This screen shows how a mobile agent summary could look later.',
        cta: 'Open Paperclip preview',
        onPress: () => {},
        accent: BLUE,
        wash: BLUE_WASH,
      };
    }

    if (agent.runtimeStatus === 'offline') {
      return {
        eyebrow: 'Preview example',
        title: 'Offline state shown here',
        body: 'This sample card shows how a stalled agent could be surfaced on your phone later.',
        cta: 'Open Paperclip preview',
        onPress: openPaperclip,
        accent: DANGER,
        wash: RED_WASH,
      };
    }

    if (agent.runtimeStatus === 'waiting') {
      return {
        eyebrow: 'Preview example',
        title: 'Review step shown here',
        body: 'This sample card shows how a pending review or handoff could appear later.',
        cta: 'Open preview session',
        onPress: openPreviewSession,
        accent: AMBER,
        wash: AMBER_WASH,
      };
    }

    return {
      eyebrow: 'Preview example',
      title: 'Steady-state summary shown here',
      body: 'This sample card shows the kind of quick read a future live view could give you.',
      cta: 'Open preview session',
      onPress: openPreviewSession,
      accent: SUCCESS,
      wash: GREEN_WASH,
    };
  }, [agent, openPaperclip, openPreviewSession]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={BLUE} />
          <Text style={styles.loadingText}>Loading preview details…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!agent) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerState}>
          <Text style={styles.emptyTitle}>This preview is unavailable</Text>
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
              <Text style={styles.eyebrow}>Agent preview</Text>
              <Text style={styles.heroTitle}>{agent.name}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: runtime.wash }]}>
              <View style={[styles.statusDot, { backgroundColor: runtime.accent }]} />
              <Text style={[styles.statusBadgeText, { color: runtime.accent }]}>{runtimeCopy(agent.runtimeStatus)}</Text>
            </View>
          </View>
          <Text style={styles.heroIntro}>{agent.runtimeHeadline}</Text>
          <Text style={styles.heroMeta}>{agent.mission}</Text>
          <PreviewNotice body="This is a built-in sample agent view. It does not connect to a live Regent account, and the money steps below stay read-only in this build." />
          <View style={styles.heroActions}>
            <Pressable
              style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
              onPress={openPreviewSession}
            >
              <Text style={styles.primaryButtonText}>{openingPreview ? 'Opening…' : 'Open preview session'}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
              onPress={openPaperclip}
            >
              <Text style={styles.secondaryButtonText}>Open Paperclip preview</Text>
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
          <Text style={styles.sectionTitle}>Preview snapshot</Text>
          <View style={styles.snapshotGrid}>
            <View style={styles.snapshotTile}>
              <Text style={styles.snapshotLabel}>Sample balance</Text>
              <Text style={styles.snapshotValue}>{agent.stablecoinSymbol} {formatCurrency(agent.stablecoinBalance)}</Text>
            </View>
            <View style={styles.snapshotTile}>
              <Text style={styles.snapshotLabel}>Sample wallet</Text>
              <Text style={styles.snapshotValue}>{formatAddress(agent.walletAddress)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleBlock}>
              <Text style={styles.sectionTitle}>Paperclip preview</Text>
              <Text style={styles.sectionHint}>A phone-sized summary of what matters now, what moves next, and what changed most recently.</Text>
            </View>
            <Pressable style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]} onPress={openPaperclip}>
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
              <Text style={styles.emptyPanelText}>This preview summary is not available right now.</Text>
            </View>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Funding preview</Text>
          <Text style={styles.sectionHint}>This sample shows where wallet-to-agent funding details will live later.</Text>
          <View style={styles.previewPanel}>
            <Text style={styles.previewPanelTitle}>Money controls stay off in this build</Text>
            <Text style={styles.previewPanelBody}>
              You cannot send money from this sample screen. Wallet send remains real on the wallet tab, but sample agents never hand off into that flow.
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Return-to-wallet preview</Text>
          <Text style={styles.sectionHint}>This sample timeline shows how a future return step may look once live agent money movement is connected.</Text>
          {agent.withdrawals.length === 0 ? (
            <View style={styles.emptyPanel}>
              <Text style={styles.emptyPanelText}>No sample return steps are listed for this preview.</Text>
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
                      <Text style={styles.timelineBody}>Sample destination {formatAddress(withdrawal.destinationWalletAddress)}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Recent sample activity</Text>
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
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusBadgeText: {
    fontSize: 12,
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
  snapshotGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  snapshotTile: {
    flex: 1,
    backgroundColor: CARD_ALT,
    borderRadius: 18,
    padding: 16,
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
    lineHeight: 22,
    fontFamily: FONTS.heading,
  },
  paperclipLeadCard: {
    backgroundColor: CARD_ALT,
    borderRadius: 18,
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
    gap: 12,
  },
  paperclipSignalCard: {
    width: '48%',
    backgroundColor: CARD_ALT,
    borderRadius: 18,
    padding: 16,
    gap: 6,
  },
  paperclipSignalLabel: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    fontFamily: FONTS.body,
  },
  paperclipSignalTitle: {
    color: TEXT_PRIMARY,
    fontSize: 16,
    lineHeight: 22,
    fontFamily: FONTS.heading,
  },
  paperclipSignalBody: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FONTS.body,
  },
  previewPanel: {
    backgroundColor: BLUE_WASH,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 18,
    padding: 16,
    gap: 8,
  },
  previewPanelTitle: {
    color: TEXT_PRIMARY,
    fontSize: 16,
    fontFamily: FONTS.heading,
  },
  previewPanelBody: {
    color: TEXT_SECONDARY,
    fontSize: 14,
    lineHeight: 20,
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
