import { MetricChip } from '@/components/agent-surfaces/MetricChip';
import { CoinbaseAlert } from '@/components/ui/CoinbaseAlerts';
import { PreviewNotice } from '@/components/ui/PreviewNotice';
import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import { PreviewTerminalSessionStatus, PreviewTerminalSessionSummary } from '@/types/terminalPreviews';
import { formatRelativeTime } from '@/utils/agent-surfaces/formatters';
import { fetchPreviewTerminalSessions } from '@/utils/fetchPreviewTerminalSessions';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const { DARK_BG, CARD_BG, CARD_ALT, TEXT_PRIMARY, TEXT_SECONDARY, BLUE, BORDER, WHITE, SUCCESS, DANGER, BLUE_WASH, ORANGE } = COLORS;

function statusCopy(status: PreviewTerminalSessionStatus) {
  switch (status) {
    case 'idle':
      return 'Ready';
    case 'running':
      return 'Working';
    case 'waiting':
      return 'Review shown';
    case 'failed':
      return 'Needs review';
  }
}

function statusEyebrow(status: PreviewTerminalSessionStatus) {
  switch (status) {
    case 'idle':
      return 'Quiet example';
    case 'running':
      return 'Active example';
    case 'waiting':
      return 'Review example';
    case 'failed':
      return 'Issue example';
  }
}

function statusColor(status: PreviewTerminalSessionStatus) {
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

function statusBackground(status: PreviewTerminalSessionStatus) {
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

function urgencyRank(status: PreviewTerminalSessionStatus) {
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

function SessionCard({
  item,
  onPress,
}: {
  item: PreviewTerminalSessionSummary;
  onPress: () => void;
}) {
  const accent = statusColor(item.status);

  return (
    <Pressable style={({ pressed }) => [styles.sessionCard, pressed && styles.cardPressed]} onPress={onPress}>
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
          <Text style={[styles.statusClusterText, { color: accent }]}>{statusCopy(item.status)}</Text>
        </View>
        {item.pendingApproval ? (
          <View style={styles.inlineApprovalPill}>
            <Ionicons name="eye-outline" size={14} color={BLUE} />
            <Text style={styles.inlineApprovalPillText}>Preview step</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.previewBlock}>
        <Text style={styles.previewLabel}>Sample update</Text>
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
        <Text style={styles.openLabel}>Open preview</Text>
        <Ionicons name="chevron-forward" size={18} color={BLUE} />
      </View>
    </Pressable>
  );
}

export default function TerminalTab() {
  const router = useRouter();
  const [sessions, setSessions] = useState<PreviewTerminalSessionSummary[]>([]);
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

  const loadTerminal = useCallback(async (refresh = false) => {
    try {
      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const nextSessions = await fetchPreviewTerminalSessions();
      setSessions(nextSessions);
    } catch (error) {
      setAlertState({
        visible: true,
        title: 'Unable to load preview sessions',
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

  return (
    <View style={styles.container}>
      <View style={styles.heroCard}>
        <Text style={styles.eyebrow}>Regents Mobile</Text>
        <Text style={styles.heroTitle}>Terminal</Text>
        <Text style={styles.heroIntro}>
          These sample sessions show how updates, review prompts, and conversation history may look in a later build.
        </Text>
        <PreviewNotice body="These are built-in sample sessions. They do not send notes, approve actions, or control a live Regent session in this build." />

        <View style={styles.metricRow}>
          <MetricChip label="Review" value={`${sessionsNeedingApproval}`} accent={ORANGE} />
          <MetricChip label="Working" value={`${sessionsRunning}`} accent={SUCCESS} />
          <MetricChip label="Issues" value={`${sessionsNeedingAttention}`} accent={DANGER} />
        </View>

        {sessionsNeedingApproval > 0 ? (
          <View style={styles.noticePill}>
            <Ionicons name="eye-outline" size={16} color={BLUE} />
            <Text style={styles.noticeText}>
              {sessionsNeedingApproval} sample session{sessionsNeedingApproval === 1 ? '' : 's'} include a review example
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.toolbar}>
        <View style={styles.toolbarCopy}>
          <Text style={styles.toolbarTitle}>Sample sessions</Text>
          <Text style={styles.toolbarSubtitle}>The list stays sorted so the most useful preview examples stay near the top.</Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}
          onPress={() =>
            setAlertState({
              visible: true,
              title: 'Preview only',
              message: 'This screen shows sample sessions only. Starting a real session comes later.',
              type: 'info',
            })
          }
        >
          <Ionicons name="eye-outline" size={16} color={WHITE} />
          <Text style={styles.primaryButtonText}>Preview only</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={BLUE} />
          <Text style={styles.loadingText}>Loading sample sessions…</Text>
        </View>
      ) : (
        <FlatList
          data={orderedSessions}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <SessionCard
              item={item}
              onPress={() => router.push({ pathname: '/terminal/[id]' as any, params: { id: item.id } })}
            />
          )}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadTerminal(true)} tintColor={BLUE} />}
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <Ionicons name="terminal-outline" size={34} color={BLUE} />
              <Text style={styles.emptyTitle}>No sample sessions yet</Text>
              <Text style={styles.emptyText}>Sample sessions will appear here when this preview data is available.</Text>
            </View>
          }
        />
      )}

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
  buttonPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
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
  cardPressed: {
    opacity: 0.96,
    transform: [{ scale: 0.985 }],
  },
  sessionAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  sessionTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 14,
  },
  sessionTitleBlock: {
    flex: 1,
    gap: 3,
  },
  sessionEyebrow: {
    color: BLUE,
    fontSize: 12,
    fontFamily: FONTS.body,
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
  sessionTimeBlock: {
    alignItems: 'flex-end',
    gap: 3,
  },
  sessionUpdatedLabel: {
    color: TEXT_SECONDARY,
    fontSize: 11,
    fontFamily: FONTS.body,
    textTransform: 'uppercase',
  },
  sessionUpdatedValue: {
    color: TEXT_PRIMARY,
    fontSize: 12,
    fontFamily: FONTS.body,
  },
  sessionStatusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
  },
  statusCluster: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  statusClusterText: {
    fontSize: 12,
    fontFamily: FONTS.body,
  },
  inlineApprovalPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: BLUE_WASH,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  inlineApprovalPillText: {
    color: BLUE,
    fontSize: 12,
    fontFamily: FONTS.body,
  },
  previewBlock: {
    gap: 6,
  },
  previewLabel: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    fontFamily: FONTS.body,
    textTransform: 'uppercase',
  },
  sessionPreview: {
    color: TEXT_PRIMARY,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONTS.body,
  },
  approvalBanner: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#FFF7EA',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 18,
    padding: 12,
  },
  approvalBannerIcon: {
    marginTop: 1,
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
    color: TEXT_SECONDARY,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FONTS.body,
  },
  sessionFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  openLabel: {
    color: BLUE,
    fontSize: 13,
    fontFamily: FONTS.body,
  },
  emptyCard: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    gap: 10,
  },
  emptyTitle: {
    color: TEXT_PRIMARY,
    fontSize: 22,
    fontFamily: FONTS.heading,
  },
  emptyText: {
    color: TEXT_SECONDARY,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONTS.body,
  },
});
