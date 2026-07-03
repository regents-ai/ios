import { StatusPill } from '@/components/agent-surfaces/StatusPill';
import { SpinningRefreshIcon } from '@/components/motion/SpinningRefreshIcon';
import { ProfileButton } from '@/components/navigation/ProfileButton';
import { ListRetryRow } from '@/components/ui/ListRetryRow';
import { RegentPressable } from '@/components/ui/RegentPressable';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { MessageThread } from '@/types/regents';
import { describeListLoadFailure, type ListLoadFailure } from '@/utils/listLoadFailure';
import { routes } from '@/utils/navigation/routes';
import { regentApi } from '@/utils/regentApi/client';
import { messageStatusTone } from '@/utils/statusTone';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { memo, useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  type ListRenderItem,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

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

function threadRank(thread: MessageThread) {
  if (thread.pendingApproval && !thread.pendingApproval.resolved) return 0;
  if (thread.status === 'waiting') return 1;
  if (thread.status === 'failed') return 2;
  if (thread.status === 'running') return 3;
  return 4;
}

type MessageThreadRowProps = {
  thread: MessageThread;
  onPressThread: (thread: MessageThread) => void;
};

const MessageThreadRow = memo(function MessageThreadRow({
  thread,
  onPressThread,
}: MessageThreadRowProps) {
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const tone = messageStatusTone(thread.status, colors);
  const handlePress = useCallback(() => {
    onPressThread(thread);
  }, [onPressThread, thread]);
  const needsApproval = !!thread.pendingApproval && !thread.pendingApproval.resolved;
  // One flattened accessibility element per row, state words included.
  const rowAccessibilityLabel = `${thread.agentName}, ${thread.title}, ${tone.label}, ${formatRelativeTime(thread.lastUpdatedAt)}${needsApproval ? ', needs your approval' : ''}`;

  return (
    <RegentPressable
      pressStyle="card"
      style={styles.sessionCard}
      onPress={handlePress}
      accessible
      accessibilityRole="button"
      accessibilityLabel={rowAccessibilityLabel}
      accessibilityHint="Opens this conversation"
    >
      <View style={styles.sessionHeader}>
        <View style={styles.sessionTitleGroup}>
          <Text style={styles.sessionAgent}>{thread.agentName}</Text>
          <Text style={styles.sessionTitle} numberOfLines={2}>{thread.title}</Text>
        </View>
        <StatusPill label={tone.label} color={tone.accent} backgroundColor={tone.wash} compact />
      </View>

      <Text style={styles.sessionNote} numberOfLines={2}>{thread.latestNote}</Text>

      <View style={styles.sessionFooter}>
        <Text style={styles.sessionMeta}>{formatRelativeTime(thread.lastUpdatedAt)}</Text>
        {thread.pendingApproval && !thread.pendingApproval.resolved ? (
          <View style={styles.reviewChip}>
            <Ionicons name="eye-outline" size={14} color={colors.warning} />
            <Text style={styles.reviewText}>
              {thread.pendingApproval.amount && thread.pendingApproval.currency ? 'Payment approval' : 'Reply waiting'}
            </Text>
          </View>
        ) : null}
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </View>
    </RegentPressable>
  );
});

function ThreadSeparator() {
  return <View style={{ height: 12 }} />;
}

function keyThread(thread: MessageThread) {
  return thread.id;
}

export default function MessageTab() {
  const router = useRouter();
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<ListLoadFailure | null>(null);

  const loadThreads = useCallback(async (refresh = false) => {
    try {
      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const nextThreads = await regentApi.listMessageThreads();
      setThreads(nextThreads);
      setLoadError(null);
    } catch (error) {
      setLoadError(describeListLoadFailure(error, 'Unable to load messages right now.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadThreads();
    }, [loadThreads])
  );

  const sortedThreads = useMemo(
    () =>
      [...threads].sort((left, right) => {
        const rankDiff = threadRank(left) - threadRank(right);
        if (rankDiff !== 0) return rankDiff;
        return new Date(right.lastUpdatedAt).getTime() - new Date(left.lastUpdatedAt).getTime();
      }),
    [threads]
  );

  const waitingCount = threads.filter((thread) => thread.status === 'waiting' || !!thread.pendingApproval).length;

  const handleThreadPress = useCallback((thread: MessageThread) => {
    router.push(routes.messageThread(thread.id));
  }, [router]);

  const renderThread = useCallback<ListRenderItem<MessageThread>>(
    ({ item }) => (
      <MessageThreadRow
        thread={item}
        onPressThread={handleThreadPress}
      />
    ),
    [handleThreadPress]
  );

  const listHeader = useMemo(() => (
    <View style={styles.listHeader}>
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
            onPress={() => loadThreads(true)}
            disabled={refreshing}
            style={styles.iconButton}
          >
            <SpinningRefreshIcon refreshing={refreshing} size={18} color={colors.accent} />
          </RegentPressable>
          <ProfileButton />
        </View>
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{threads.length}</Text>
          <Text style={styles.summaryLabel}>Open</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{waitingCount}</Text>
          <Text style={styles.summaryLabel}>Needs approval</Text>
        </View>
      </View>

      {loadError ? (
        <ListRetryRow
          title={loadError.title}
          message={loadError.message}
          offline={loadError.offline}
          onRetry={() => loadThreads()}
          retryHint="Tries loading your messages again"
        />
      ) : null}
    </View>
  ), [colors, styles, loadError, loadThreads, refreshing, threads.length, waitingCount]);

  const listEmpty = useMemo(() => {
    if (loading) {
      return (
        <View style={styles.emptyState}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.emptyTitle}>Loading messages</Text>
        </View>
      );
    }

    // The retry row in the header already explains a failed load; showing
    // "No messages yet" under it would be misleading.
    if (loadError) {
      return null;
    }

    return (
      <View style={styles.emptyState}>
        <View style={styles.emptyIcon}>
          <Ionicons name="chatbubble-ellipses-outline" size={24} color={colors.accent} />
        </View>
        <Text style={styles.emptyTitle}>No messages yet</Text>
        <Text style={styles.emptyBody}>Agent messages, payment requests, and work updates can appear here when they need you.</Text>
      </View>
    );
  }, [colors, styles, loading, loadError]);

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        style={styles.scroller}
        data={sortedThreads}
        renderItem={renderThread}
        keyExtractor={keyThread}
        ItemSeparatorComponent={ThreadSeparator}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.accent}
            onRefresh={() => loadThreads(true)}
          />
        }
      />
    </SafeAreaView>
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
    paddingBottom: 120,
  },
  listHeader: {
    gap: 16,
    marginBottom: 16,
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    borderRadius: 18,
    padding: 16,
    gap: 4,
  },
  summaryValue: {
    color: colors.text,
    fontSize: 26,
    fontFamily: fonts.title,
  },
  summaryLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontFamily: fonts.ui,
  },
  threadSeparator: {
    height: 12,
  },
  sessionCard: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
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
    color: colors.accent,
    fontSize: 12,
    textTransform: 'uppercase',
    fontFamily: fonts.ui,
  },
  sessionTitle: {
    color: colors.text,
    fontSize: 20,
    lineHeight: 24,
    fontFamily: fonts.title,
  },
  sessionNote: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.ui,
  },
  sessionFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sessionMeta: {
    flex: 1,
    color: colors.textMuted,
    fontSize: 12,
    fontFamily: fonts.ui,
  },
  reviewChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    backgroundColor: colors.warningWash,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  reviewText: {
    color: colors.warning,
    fontSize: 12,
    fontFamily: fonts.ui,
  },
  emptyState: {
    minHeight: 260,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
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
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 21,
    fontFamily: fonts.title,
  },
  emptyBody: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    fontFamily: fonts.ui,
  },
  });
}
