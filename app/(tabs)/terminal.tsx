import { StatusPill } from '@/components/agent-surfaces/StatusPill';
import { SpinningRefreshIcon } from '@/components/motion/SpinningRefreshIcon';
import { ProfileButton } from '@/components/navigation/ProfileButton';
import { CoinbaseAlert } from '@/components/ui/CoinbaseAlerts';
import { RegentPressable } from '@/components/ui/RegentPressable';
import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import { TerminalSessionStatus, TerminalSessionSummary } from '@/types/regents';
import { routes } from '@/utils/navigation/routes';
import { regentApi } from '@/utils/regentApi/client';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const { DARK_BG, CARD_BG, CARD_ALT, TEXT_PRIMARY, TEXT_SECONDARY, BLUE, BORDER, SUCCESS, DANGER, BLUE_WASH } = COLORS;
const AMBER = '#A3703A';
const AMBER_WASH = '#F2E7DA';
const GREEN_WASH = '#E6F0EA';
const RED_WASH = '#F3E1DD';

function formatRelativeTime(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    return 'Recently';
  }

  const diffMinutes = Math.max(1, Math.round((Date.now() - timestamp) / 60000));
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.round(diffHours / 24)}d ago`;
}

function statusTone(status: TerminalSessionStatus) {
  switch (status) {
    case 'running':
      return { label: 'Working', accent: BLUE, wash: BLUE_WASH };
    case 'waiting':
      return { label: 'Approval', accent: AMBER, wash: AMBER_WASH };
    case 'failed':
      return { label: 'Needs help', accent: DANGER, wash: RED_WASH };
    case 'idle':
      return { label: 'Open', accent: SUCCESS, wash: GREEN_WASH };
  }
}

function sessionRank(session: TerminalSessionSummary) {
  if (session.pendingApproval && !session.pendingApproval.resolved) return 0;
  if (session.status === 'waiting') return 1;
  if (session.status === 'failed') return 2;
  if (session.status === 'running') return 3;
  return 4;
}

export default function TerminalTab() {
  const router = useRouter();
  const [sessions, setSessions] = useState<TerminalSessionSummary[]>([]);
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

  const loadSessions = useCallback(async (refresh = false) => {
    try {
      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const nextSessions = await regentApi.listTerminalSessions();
      setSessions(nextSessions);
    } catch (error) {
      setAlertState({
        visible: true,
        title: 'Could not load messages',
        message: error instanceof Error ? error.message : 'Try again in a moment.',
        type: 'error',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSessions();
    }, [loadSessions])
  );

  const sortedSessions = useMemo(
    () =>
      [...sessions].sort((left, right) => {
        const rankDiff = sessionRank(left) - sessionRank(right);
        if (rankDiff !== 0) return rankDiff;
        return new Date(right.lastUpdatedAt).getTime() - new Date(left.lastUpdatedAt).getTime();
      }),
    [sessions]
  );

  const waitingCount = sessions.filter((session) => session.status === 'waiting' || !!session.pendingApproval).length;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scroller}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={BLUE}
            onRefresh={() => loadSessions(true)}
          />
        }
      >
        <View style={styles.header}>
          <View style={styles.titleGroup}>
            <Text style={styles.eyebrow}>Message</Text>
            <Text style={styles.title}>Message your agent</Text>
            <Text style={styles.subtitle}>
              Talk with your own agent, approve payment requests, and keep agent work together.
            </Text>
          </View>
          <View style={styles.headerActions}>
            <RegentPressable
              pressStyle="icon"
              onPress={() => loadSessions(true)}
              disabled={refreshing}
              style={styles.iconButton}
            >
              <SpinningRefreshIcon refreshing={refreshing} size={18} color={BLUE} />
            </RegentPressable>
            <ProfileButton />
          </View>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{sessions.length}</Text>
            <Text style={styles.summaryLabel}>Open</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{waitingCount}</Text>
            <Text style={styles.summaryLabel}>Needs approval</Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.emptyState}>
            <ActivityIndicator color={BLUE} />
            <Text style={styles.emptyTitle}>Loading messages</Text>
          </View>
        ) : sortedSessions.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="chatbubble-ellipses-outline" size={24} color={BLUE} />
            </View>
            <Text style={styles.emptyTitle}>No messages yet</Text>
            <Text style={styles.emptyBody}>Agent messages, payment requests, and work updates can appear here when they need you.</Text>
          </View>
        ) : (
          <View style={styles.sessionList}>
            {sortedSessions.map((session) => {
              const tone = statusTone(session.status);
              return (
                <RegentPressable
                  key={session.id}
                  pressStyle="card"
                  style={styles.sessionCard}
                  onPress={() => router.push(routes.terminalSession(session.id))}
                >
                  <View style={styles.sessionHeader}>
                    <View style={styles.sessionTitleGroup}>
                      <Text style={styles.sessionAgent}>{session.agentName}</Text>
                      <Text style={styles.sessionTitle} numberOfLines={2}>{session.title}</Text>
                    </View>
                    <StatusPill label={tone.label} color={tone.accent} backgroundColor={tone.wash} compact />
                  </View>

                  <Text style={styles.sessionNote} numberOfLines={2}>{session.latestNote}</Text>

                  <View style={styles.sessionFooter}>
                    <Text style={styles.sessionMeta}>{formatRelativeTime(session.lastUpdatedAt)}</Text>
                    {session.pendingApproval && !session.pendingApproval.resolved ? (
                      <View style={styles.reviewChip}>
                        <Ionicons name="eye-outline" size={14} color={AMBER} />
                        <Text style={styles.reviewText}>
                          {session.pendingApproval.amount && session.pendingApproval.currency ? 'Payment approval' : 'Reply waiting'}
                        </Text>
                      </View>
                    ) : null}
                    <Ionicons name="chevron-forward" size={18} color={TEXT_SECONDARY} />
                  </View>
                </RegentPressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      <CoinbaseAlert
        visible={alertState.visible}
        type={alertState.type}
        title={alertState.title}
        message={alertState.message}
        confirmText="OK"
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
  scroller: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 120,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    paddingTop: 8,
  },
  titleGroup: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  eyebrow: {
    color: BLUE,
    fontSize: 12,
    textTransform: 'uppercase',
    fontFamily: FONTS.body,
  },
  title: {
    color: TEXT_PRIMARY,
    fontSize: 32,
    lineHeight: 38,
    fontFamily: FONTS.heading,
  },
  subtitle: {
    color: TEXT_SECONDARY,
    fontSize: 15,
    lineHeight: 21,
    fontFamily: FONTS.body,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 18,
    padding: 16,
    gap: 4,
  },
  summaryValue: {
    color: TEXT_PRIMARY,
    fontSize: 26,
    fontFamily: FONTS.heading,
  },
  summaryLabel: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    fontFamily: FONTS.body,
  },
  sessionList: {
    gap: 12,
  },
  sessionCard: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 20,
    padding: 16,
    gap: 12,
  },
  sessionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  sessionTitleGroup: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  sessionAgent: {
    color: BLUE,
    fontSize: 12,
    textTransform: 'uppercase',
    fontFamily: FONTS.body,
  },
  sessionTitle: {
    color: TEXT_PRIMARY,
    fontSize: 20,
    lineHeight: 24,
    fontFamily: FONTS.heading,
  },
  sessionNote: {
    color: TEXT_SECONDARY,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONTS.body,
  },
  sessionFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sessionMeta: {
    flex: 1,
    color: TEXT_SECONDARY,
    fontSize: 12,
    fontFamily: FONTS.body,
  },
  reviewChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    backgroundColor: AMBER_WASH,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  reviewText: {
    color: AMBER,
    fontSize: 12,
    fontFamily: FONTS.body,
  },
  emptyState: {
    minHeight: 260,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 24,
    padding: 24,
    gap: 10,
  },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CARD_ALT,
    borderWidth: 1,
    borderColor: BORDER,
  },
  emptyTitle: {
    color: TEXT_PRIMARY,
    fontSize: 21,
    fontFamily: FONTS.heading,
  },
  emptyBody: {
    color: TEXT_SECONDARY,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    fontFamily: FONTS.body,
  },
});
