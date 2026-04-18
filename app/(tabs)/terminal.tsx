import { CoinbaseAlert } from '@/components/ui/CoinbaseAlerts';
import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import { AgentSummary } from '@/types/agents';
import { TerminalSessionSummary } from '@/types/terminal';
import { createTerminalSession } from '@/utils/createTerminalSession';
import { fetchAgents } from '@/utils/fetchAgents';
import { fetchTerminalSessions } from '@/utils/fetchTerminalSessions';
import { showLocalNotification } from '@/utils/pushNotifications';
import { hasSeenTerminalNotice, markTerminalNoticeSeen } from '@/utils/sharedState';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const { DARK_BG, CARD_BG, CARD_ALT, TEXT_PRIMARY, TEXT_SECONDARY, BLUE, BORDER, WHITE, SUCCESS, DANGER, BLUE_WASH } = COLORS;

function statusCopy(status: TerminalSessionSummary['status']) {
  switch (status) {
    case 'idle':
      return 'Idle';
    case 'running':
      return 'Running';
    case 'waiting':
      return 'Needs approval';
    case 'failed':
      return 'Needs attention';
  }
}

function statusColor(status: TerminalSessionSummary['status']) {
  switch (status) {
    case 'idle':
      return TEXT_SECONDARY;
    case 'running':
      return SUCCESS;
    case 'waiting':
      return '#A3703A';
    case 'failed':
      return DANGER;
  }
}

function relativeTime(dateString: string) {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const diffMinutes = Math.max(1, Math.round(diffMs / 60000));
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.round(diffHours / 24)}d ago`;
}

export default function TerminalTab() {
  const router = useRouter();
  const [sessions, setSessions] = useState<TerminalSessionSummary[]>([]);
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showStartModal, setShowStartModal] = useState(false);
  const [creatingSessionId, setCreatingSessionId] = useState<string | null>(null);
  const hasPrimedNotifications = useRef(false);
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

  const primeTerminalNoticeState = useCallback((items: TerminalSessionSummary[]) => {
    items.forEach((session) => {
      if (session.status === 'waiting' && session.pendingApproval) {
        markTerminalNoticeSeen(`waiting:${session.id}:${session.pendingApproval.requestId}`);
      }

      if (session.status === 'idle') {
        markTerminalNoticeSeen(`idle:${session.id}:${session.lastUpdatedAt}`);
      }
    });
  }, []);

  const notifyAboutSessionChanges = useCallback(async (items: TerminalSessionSummary[]) => {
    if (!hasPrimedNotifications.current) {
      primeTerminalNoticeState(items);
      hasPrimedNotifications.current = true;
      return;
    }

    for (const session of items) {
      if (session.status === 'waiting' && session.pendingApproval) {
        const noticeKey = `waiting:${session.id}:${session.pendingApproval.requestId}`;
        if (!hasSeenTerminalNotice(noticeKey)) {
          markTerminalNoticeSeen(noticeKey);
          await showLocalNotification(
            'Approval needed',
            `${session.agentName} is waiting for your answer in Terminal.`,
            { sessionId: session.id, kind: 'approval-needed' }
          );
        }
      }

      if (session.status === 'idle') {
        const noticeKey = `idle:${session.id}:${session.lastUpdatedAt}`;
        if (!hasSeenTerminalNotice(noticeKey)) {
          markTerminalNoticeSeen(noticeKey);
          await showLocalNotification(
            'New terminal update',
            `${session.agentName} shared a fresh update in Terminal.`,
            { sessionId: session.id, kind: 'session-update' }
          );
        }
      }
    }
  }, [primeTerminalNoticeState]);

  const loadTerminal = useCallback(async (refresh = false) => {
    try {
      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const [nextSessions, nextAgents] = await Promise.all([
        fetchTerminalSessions(),
        fetchAgents(),
      ]);

      await notifyAboutSessionChanges(nextSessions);
      setSessions(nextSessions);
      setAgents(nextAgents);
    } catch (error) {
      setAlertState({
        visible: true,
        title: 'Unable to load terminal sessions',
        message: error instanceof Error ? error.message : 'Try again in a moment.',
        type: 'error',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [notifyAboutSessionChanges]);

  useFocusEffect(
    useCallback(() => {
      loadTerminal();
    }, [loadTerminal])
  );

  const sessionsNeedingApproval = useMemo(
    () => sessions.filter((session) => session.status === 'waiting').length,
    [sessions]
  );

  const startSession = async (agent: AgentSummary) => {
    try {
      setCreatingSessionId(agent.id);
      const session = await createTerminalSession({
        agentId: agent.id,
        agentName: agent.name,
      });
      setShowStartModal(false);
      await loadTerminal(true);
      router.push({ pathname: '/terminal/[id]' as any, params: { id: session.id } });
    } catch (error) {
      setAlertState({
        visible: true,
        title: 'Unable to start session',
        message: error instanceof Error ? error.message : 'Try again in a moment.',
        type: 'error',
      });
    } finally {
      setCreatingSessionId(null);
    }
  };

  const renderSession = ({ item }: { item: TerminalSessionSummary }) => {
    const accent = statusColor(item.status);

    return (
      <Pressable
        onPress={() => router.push({ pathname: '/terminal/[id]' as any, params: { id: item.id } })}
        style={({ pressed }) => [styles.sessionCard, pressed && styles.cardPressed]}
      >
        <View style={styles.sessionHeader}>
          <View style={styles.sessionTitleBlock}>
            <Text style={styles.sessionTitle}>{item.title}</Text>
            <Text style={styles.sessionAgent}>{item.agentName}</Text>
          </View>
          <View style={[styles.statusPill, { borderColor: accent }]}>
            <Text style={[styles.statusPillText, { color: accent }]}>{statusCopy(item.status)}</Text>
          </View>
        </View>

        <Text style={styles.sessionPreview}>{item.preview}</Text>

        {item.pendingApproval ? (
          <View style={styles.approvalBanner}>
            <Ionicons name="alert-circle-outline" size={16} color={BLUE} />
            <Text style={styles.approvalText}>{item.pendingApproval.details}</Text>
          </View>
        ) : null}

        <View style={styles.sessionFooter}>
          <Text style={styles.footerMeta}>{relativeTime(item.lastUpdatedAt)}</Text>
          <Ionicons name="chevron-forward" size={18} color={BLUE} />
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.heroCard}>
        <Text style={styles.eyebrow}>Regents Mobile</Text>
        <Text style={styles.heroTitle}>Terminal</Text>
        <Text style={styles.heroIntro}>
          Follow live agent sessions, step in from your phone, and clear approvals without leaving the app.
        </Text>
        {sessionsNeedingApproval > 0 ? (
          <View style={styles.noticePill}>
            <Ionicons name="notifications-outline" size={16} color={BLUE} />
            <Text style={styles.noticeText}>
              {sessionsNeedingApproval} session{sessionsNeedingApproval === 1 ? '' : 's'} need approval
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.toolbar}>
        <Text style={styles.toolbarTitle}>Recent sessions</Text>
        <Pressable style={styles.primaryButton} onPress={() => setShowStartModal(true)}>
          <Text style={styles.primaryButtonText}>Start session</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={BLUE} />
          <Text style={styles.loadingText}>Loading sessions…</Text>
        </View>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(item) => item.id}
          renderItem={renderSession}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadTerminal(true)} tintColor={BLUE} />}
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <Ionicons name="terminal-outline" size={34} color={BLUE} />
              <Text style={styles.emptyTitle}>No sessions yet</Text>
              <Text style={styles.emptyText}>Start a session to talk with an agent from your phone.</Text>
            </View>
          }
        />
      )}

      <Modal visible={showStartModal} transparent animationType="fade" onRequestClose={() => setShowStartModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Start a session</Text>
            <Text style={styles.modalBody}>Choose which agent you want to reach from mobile.</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              <View style={styles.agentChoiceList}>
                {agents.map((agent) => (
                  <Pressable
                    key={agent.id}
                    style={styles.agentChoice}
                    onPress={() => startSession(agent)}
                    disabled={creatingSessionId === agent.id}
                  >
                    <View>
                      <Text style={styles.agentChoiceTitle}>{agent.name}</Text>
                      <Text style={styles.agentChoiceSubtitle}>{agent.treasuryNote || 'Open a live session with this agent.'}</Text>
                    </View>
                    {creatingSessionId === agent.id ? (
                      <ActivityIndicator size="small" color={BLUE} />
                    ) : (
                      <Ionicons name="arrow-forward" size={18} color={BLUE} />
                    )}
                  </Pressable>
                ))}
              </View>
            </ScrollView>
            <Pressable style={styles.secondaryButton} onPress={() => setShowStartModal(false)}>
              <Text style={styles.secondaryButtonText}>Close</Text>
            </Pressable>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DARK_BG,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  heroCard: {
    backgroundColor: CARD_BG,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 22,
    gap: 10,
    marginBottom: 16,
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
    color: TEXT_SECONDARY,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: FONTS.body,
  },
  noticePill: {
    alignSelf: 'flex-start',
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: BLUE_WASH,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  noticeText: {
    color: BLUE,
    fontSize: 13,
    fontFamily: FONTS.body,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  toolbarTitle: {
    color: TEXT_PRIMARY,
    fontSize: 22,
    fontFamily: FONTS.heading,
  },
  primaryButton: {
    backgroundColor: BLUE,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
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
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: TEXT_SECONDARY,
    fontSize: 15,
    fontFamily: FONTS.body,
  },
  listContent: {
    paddingBottom: 32,
    gap: 14,
  },
  sessionCard: {
    backgroundColor: CARD_ALT,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 18,
    gap: 12,
  },
  cardPressed: {
    opacity: 0.92,
  },
  sessionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  sessionTitleBlock: {
    flex: 1,
    gap: 4,
  },
  sessionTitle: {
    color: TEXT_PRIMARY,
    fontSize: 22,
    fontFamily: FONTS.heading,
  },
  sessionAgent: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    fontFamily: FONTS.body,
  },
  statusPill: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: WHITE,
  },
  statusPillText: {
    fontSize: 12,
    fontFamily: FONTS.body,
  },
  sessionPreview: {
    color: TEXT_PRIMARY,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONTS.body,
  },
  approvalBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: BLUE_WASH,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 12,
  },
  approvalText: {
    flex: 1,
    color: BLUE,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FONTS.body,
  },
  sessionFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerMeta: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    fontFamily: FONTS.body,
  },
  emptyCard: {
    backgroundColor: CARD_BG,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 28,
    alignItems: 'center',
    gap: 12,
  },
  emptyTitle: {
    color: TEXT_PRIMARY,
    fontSize: 24,
    fontFamily: FONTS.heading,
  },
  emptyText: {
    color: TEXT_SECONDARY,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
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
  agentChoiceList: {
    gap: 10,
  },
  agentChoice: {
    backgroundColor: WHITE,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  agentChoiceTitle: {
    color: TEXT_PRIMARY,
    fontSize: 16,
    fontFamily: FONTS.heading,
  },
  agentChoiceSubtitle: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
    fontFamily: FONTS.body,
  },
});
