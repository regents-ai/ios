import { MetricChip } from '@/components/agent-surfaces/MetricChip';
import { CoinbaseAlert } from '@/components/ui/CoinbaseAlerts';
import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import { AgentSummary } from '@/types/agents';
import { formatRelativeTime } from '@/utils/agent-surfaces/formatters';
import { TerminalSessionStatus, TerminalSessionSummary } from '@/types/terminal';
import { createTerminalSession } from '@/utils/createTerminalSession';
import { fetchAgents } from '@/utils/fetchAgents';
import { fetchTerminalSessions } from '@/utils/fetchTerminalSessions';
import { showLocalNotification } from '@/utils/pushNotifications';
import { hasSeenTerminalNotice, markTerminalNoticeSeen } from '@/utils/state/flowRuntimeState';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { ComponentProps, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const { DARK_BG, CARD_BG, CARD_ALT, TEXT_PRIMARY, TEXT_SECONDARY, BLUE, BORDER, WHITE, SUCCESS, DANGER, BLUE_WASH, ORANGE } = COLORS;

type IoniconName = ComponentProps<typeof Ionicons>['name'];

function useReduceMotion() {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (active) {
          setReduceMotion(enabled);
        }
      })
      .catch(() => {});

    const subscription = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReduceMotion);

    return () => {
      active = false;
      subscription?.remove?.();
    };
  }, []);

  return reduceMotion;
}

function statusCopy(status: TerminalSessionStatus) {
  switch (status) {
    case 'idle':
      return 'Ready';
    case 'running':
      return 'Working now';
    case 'waiting':
      return 'Waiting on you';
    case 'failed':
      return 'Needs attention';
  }
}

function statusEyebrow(status: TerminalSessionStatus) {
  switch (status) {
    case 'idle':
      return 'Quiet session';
    case 'running':
      return 'Live now';
    case 'waiting':
      return 'Needs your answer';
    case 'failed':
      return 'Review soon';
  }
}

function statusColor(status: TerminalSessionStatus) {
  switch (status) {
    case 'idle':
      return TEXT_SECONDARY;
    case 'running':
      return SUCCESS;
    case 'waiting':
      return ORANGE;
    case 'failed':
      return DANGER;
  }
}

function statusBackground(status: TerminalSessionStatus) {
  switch (status) {
    case 'idle':
      return WHITE;
    case 'running':
      return '#E4F1EA';
    case 'waiting':
      return '#F3E7D8';
    case 'failed':
      return '#F7E4E1';
  }
}

function statusIcon(status: TerminalSessionStatus): IoniconName {
  switch (status) {
    case 'idle':
      return 'pause-circle-outline';
    case 'running':
      return 'sparkles-outline';
    case 'waiting':
      return 'alert-circle-outline';
    case 'failed':
      return 'warning-outline';
  }
}

function urgencyRank(status: TerminalSessionStatus) {
  switch (status) {
    case 'waiting':
      return 0;
    case 'failed':
      return 1;
    case 'running':
      return 2;
    case 'idle':
      return 3;
  }
}

function LiveDot({
  color,
  animate,
}: {
  color: string;
  animate: boolean;
}) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!animate) {
      pulse.setValue(1);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.45,
          duration: 850,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 850,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );

    loop.start();
    return () => loop.stop();
  }, [animate, pulse]);

  return (
    <Animated.View
      style={[
        styles.liveDot,
        {
          backgroundColor: color,
          opacity: pulse,
          transform: [{ scale: pulse }],
        },
      ]}
    />
  );
}

function SessionCard({
  item,
  index,
  reduceMotion,
  onPress,
}: {
  item: TerminalSessionSummary;
  index: number;
  reduceMotion: boolean;
  onPress: () => void;
}) {
  const pressScale = useRef(new Animated.Value(1)).current;
  const enterOpacity = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const enterY = useRef(new Animated.Value(reduceMotion ? 0 : 18)).current;
  const accent = statusColor(item.status);

  useEffect(() => {
    if (reduceMotion) {
      enterOpacity.setValue(1);
      enterY.setValue(0);
      return;
    }

    Animated.parallel([
      Animated.timing(enterOpacity, {
        toValue: 1,
        duration: 280,
        delay: index * 45,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(enterY, {
        toValue: 0,
        duration: 320,
        delay: index * 45,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [enterOpacity, enterY, index, reduceMotion]);

  const handlePressIn = () => {
    if (reduceMotion) {
      return;
    }

    Animated.spring(pressScale, {
      toValue: 0.985,
      useNativeDriver: true,
      speed: 28,
      bounciness: 0,
    }).start();
  };

  const handlePressOut = () => {
    if (reduceMotion) {
      return;
    }

    Animated.spring(pressScale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 0,
    }).start();
  };

  return (
    <Animated.View
      style={{
        opacity: enterOpacity,
        transform: [{ translateY: enterY }, { scale: pressScale }],
      }}
    >
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={styles.sessionCard}
      >
        <View style={[styles.sessionAccent, { backgroundColor: accent }]} />

        <View style={styles.sessionTopRow}>
          <View style={styles.sessionTitleBlock}>
            <Text style={styles.sessionEyebrow}>{statusEyebrow(item.status)}</Text>
            <Text style={styles.sessionTitle}>{item.title}</Text>
            <Text style={styles.sessionAgent}>{item.agentName}</Text>
          </View>

          <View style={styles.sessionTimeBlock}>
            <Text style={styles.sessionUpdatedLabel}>Updated</Text>
            <Text style={styles.sessionUpdatedValue}>{formatRelativeTime(item.lastUpdatedAt)}</Text>
          </View>
        </View>

        <View style={styles.sessionStatusRow}>
          <View style={[styles.statusCluster, { backgroundColor: statusBackground(item.status), borderColor: accent }]}>
            <LiveDot color={accent} animate={!reduceMotion && item.status !== 'idle'} />
            <Ionicons name={statusIcon(item.status)} size={15} color={accent} />
            <Text style={[styles.statusClusterText, { color: accent }]}>{statusCopy(item.status)}</Text>
          </View>
          {item.pendingApproval ? (
            <View style={styles.inlineApprovalPill}>
              <Ionicons name="key-outline" size={14} color={BLUE} />
              <Text style={styles.inlineApprovalPillText}>Approval waiting</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.previewBlock}>
          <Text style={styles.previewLabel}>Latest update</Text>
          <Text style={styles.sessionPreview}>{item.preview}</Text>
        </View>

        {item.pendingApproval ? (
          <View style={styles.approvalBanner}>
            <View style={styles.approvalBannerIcon}>
              <Ionicons name="alert-circle-outline" size={16} color={ORANGE} />
            </View>
            <View style={styles.approvalBannerCopy}>
              <Text style={styles.approvalBannerTitle}>{item.pendingApproval.label}</Text>
              <Text style={styles.approvalText}>{item.pendingApproval.details}</Text>
            </View>
          </View>
        ) : null}

        <View style={styles.sessionFooter}>
          <Text style={styles.openLabel}>Open session</Text>
          <Ionicons name="chevron-forward" size={18} color={BLUE} />
        </View>
      </Pressable>
    </Animated.View>
  );
}

function StartButton({
  onPress,
  reduceMotion,
}: {
  onPress: () => void;
  reduceMotion: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    if (reduceMotion) {
      return;
    }

    Animated.spring(scale, {
      toValue: 0.97,
      useNativeDriver: true,
      speed: 24,
      bounciness: 0,
    }).start();
  };

  const handlePressOut = () => {
    if (reduceMotion) {
      return;
    }

    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 18,
      bounciness: 0,
    }).start();
  };

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable style={styles.primaryButton} onPress={onPress} onPressIn={handlePressIn} onPressOut={handlePressOut}>
        <Ionicons name="add-circle-outline" size={16} color={WHITE} />
        <Text style={styles.primaryButtonText}>Start session</Text>
      </Pressable>
    </Animated.View>
  );
}

export default function TerminalTab() {
  const router = useRouter();
  const reduceMotion = useReduceMotion();
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

  const orderedSessions = useMemo(
    () =>
      [...sessions].sort((left, right) => {
        const urgencyDifference = urgencyRank(left.status) - urgencyRank(right.status);
        if (urgencyDifference !== 0) {
          return urgencyDifference;
        }

        return new Date(right.lastUpdatedAt).getTime() - new Date(left.lastUpdatedAt).getTime();
      }),
    [sessions]
  );

  const sessionsNeedingApproval = useMemo(
    () => sessions.filter((session) => session.status === 'waiting').length,
    [sessions]
  );

  const sessionsRunning = useMemo(
    () => sessions.filter((session) => session.status === 'running').length,
    [sessions]
  );

  const sessionsNeedingAttention = useMemo(
    () => sessions.filter((session) => session.status === 'failed').length,
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

  return (
    <View style={styles.container}>
      <View style={styles.heroCard}>
        <Text style={styles.eyebrow}>Regents Mobile</Text>
        <Text style={styles.heroTitle}>Terminal</Text>
        <Text style={styles.heroIntro}>
          Watch live work, jump into a session, and answer requests before an agent gets stuck.
        </Text>

        <View style={styles.metricRow}>
          <MetricChip label="Waiting" value={`${sessionsNeedingApproval}`} accent={ORANGE} />
          <MetricChip label="Live" value={`${sessionsRunning}`} accent={SUCCESS} />
          <MetricChip label="Review" value={`${sessionsNeedingAttention}`} accent={DANGER} />
        </View>

        {sessionsNeedingApproval > 0 ? (
          <View style={styles.noticePill}>
            <Ionicons name="notifications-outline" size={16} color={BLUE} />
            <Text style={styles.noticeText}>
              {sessionsNeedingApproval} session{sessionsNeedingApproval === 1 ? '' : 's'} are waiting on you
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.toolbar}>
        <View style={styles.toolbarCopy}>
          <Text style={styles.toolbarTitle}>Recent sessions</Text>
          <Text style={styles.toolbarSubtitle}>The list stays sorted so the most urgent work stays at the top.</Text>
        </View>
        <StartButton onPress={() => setShowStartModal(true)} reduceMotion={reduceMotion} />
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={BLUE} />
          <Text style={styles.loadingText}>Loading sessions…</Text>
        </View>
      ) : (
        <FlatList
          data={orderedSessions}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <SessionCard
              item={item}
              index={index}
              reduceMotion={reduceMotion}
              onPress={() => router.push({ pathname: '/terminal/[id]' as any, params: { id: item.id } })}
            />
          )}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadTerminal(true)} tintColor={BLUE} />}
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <Ionicons name="terminal-outline" size={34} color={BLUE} />
              <Text style={styles.emptyTitle}>No sessions yet</Text>
              <Text style={styles.emptyText}>Start a session when you want to check in with an agent from your phone.</Text>
            </View>
          }
        />
      )}

      <Modal visible={showStartModal} transparent animationType="fade" onRequestClose={() => setShowStartModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Start a session</Text>
            <Text style={styles.modalBody}>Choose the agent you want to reach right now.</Text>
            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.agentChoiceList}>
                {agents.map((agent) => (
                  <Pressable
                    key={agent.id}
                    style={({ pressed }) => [styles.agentChoice, pressed && styles.agentChoicePressed]}
                    onPress={() => startSession(agent)}
                    disabled={creatingSessionId === agent.id}
                  >
                    <View style={styles.agentChoiceCopy}>
                      <Text style={styles.agentChoiceTitle}>{agent.name}</Text>
                      <Text style={styles.agentChoiceSubtitle}>
                        {agent.treasuryNote || 'Open a live session and keep things moving from your phone.'}
                      </Text>
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
    borderRadius: 28,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 22,
    gap: 14,
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
  metricRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  noticePill: {
    alignSelf: 'flex-start',
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
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  toolbarCopy: {
    flex: 1,
    gap: 4,
  },
  toolbarTitle: {
    color: TEXT_PRIMARY,
    fontSize: 22,
    fontFamily: FONTS.heading,
  },
  toolbarSubtitle: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FONTS.body,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: BLUE,
    borderRadius: 16,
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
    borderRadius: 16,
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
    position: 'relative',
    backgroundColor: CARD_ALT,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 18,
    gap: 14,
    overflow: 'hidden',
  },
  sessionAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 6,
  },
  sessionTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingLeft: 6,
  },
  sessionTitleBlock: {
    flex: 1,
    gap: 4,
  },
  sessionEyebrow: {
    color: TEXT_SECONDARY,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontFamily: FONTS.body,
  },
  sessionTitle: {
    color: TEXT_PRIMARY,
    fontSize: 23,
    fontFamily: FONTS.heading,
  },
  sessionAgent: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    fontFamily: FONTS.body,
  },
  sessionTimeBlock: {
    alignItems: 'flex-end',
    gap: 2,
  },
  sessionUpdatedLabel: {
    color: TEXT_SECONDARY,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontFamily: FONTS.body,
  },
  sessionUpdatedValue: {
    color: TEXT_PRIMARY,
    fontSize: 13,
    fontFamily: FONTS.body,
  },
  sessionStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingLeft: 6,
    flexWrap: 'wrap',
  },
  statusCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusClusterText: {
    fontSize: 13,
    fontFamily: FONTS.body,
  },
  inlineApprovalPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: BLUE_WASH,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  inlineApprovalPillText: {
    color: BLUE,
    fontSize: 12,
    fontFamily: FONTS.body,
  },
  previewBlock: {
    gap: 8,
    paddingLeft: 6,
  },
  previewLabel: {
    color: TEXT_SECONDARY,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
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
    gap: 10,
    backgroundColor: '#F7EDDE',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    marginLeft: 6,
  },
  approvalBannerIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: WHITE,
  },
  approvalBannerCopy: {
    flex: 1,
    gap: 4,
  },
  approvalBannerTitle: {
    color: TEXT_PRIMARY,
    fontSize: 14,
    fontFamily: FONTS.heading,
  },
  approvalText: {
    color: TEXT_PRIMARY,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FONTS.body,
  },
  sessionFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingLeft: 6,
  },
  openLabel: {
    color: BLUE,
    fontSize: 13,
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
    backgroundColor: 'rgba(49, 85, 105, 0.24)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    backgroundColor: CARD_BG,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 20,
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
  modalScroll: {
    maxHeight: 320,
  },
  agentChoiceList: {
    gap: 10,
  },
  agentChoice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: WHITE,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
  },
  agentChoicePressed: {
    opacity: 0.9,
  },
  agentChoiceCopy: {
    flex: 1,
    gap: 4,
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
    fontFamily: FONTS.body,
  },
});
