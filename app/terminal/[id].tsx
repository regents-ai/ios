import { CoinbaseAlert } from '@/components/ui/CoinbaseAlerts';
import { PreviewNotice } from '@/components/ui/PreviewNotice';
import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import { PreviewTerminalEvent, PreviewTerminalSessionDetail } from '@/types/terminalPreviews';
import { fetchPreviewTerminalEvents } from '@/utils/fetchPreviewTerminalEvents';
import { fetchPreviewTerminalSession } from '@/utils/fetchPreviewTerminalSession';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const {
  DARK_BG,
  CARD_BG,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  BLUE,
  BORDER,
  WHITE,
  SUCCESS,
  DANGER,
  BLUE_WASH,
  ORANGE,
} = COLORS;

type MessageRow = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  ts: string;
  label: string;
};

function statusCopy(status: PreviewTerminalSessionDetail['status']) {
  switch (status) {
    case 'idle':
      return 'Ready example';
    case 'running':
      return 'Working example';
    case 'waiting':
      return 'Review example';
    case 'failed':
      return 'Issue example';
  }
}

function statusColor(status: PreviewTerminalSessionDetail['status']) {
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

function statusBackground(status: PreviewTerminalSessionDetail['status']) {
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

function relativeTime(dateString: string) {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const diffMinutes = Math.max(1, Math.round(diffMs / 60000));
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.round(diffHours / 24)}d ago`;
}

function eventsToMessages(events: PreviewTerminalEvent[]): MessageRow[] {
  const rows: MessageRow[] = [];

  for (const event of events) {
    if (event.type === 'message.user' && event.text) {
      rows.push({
        id: `${event.ts}-user`,
        role: 'user',
        text: event.text,
        ts: event.ts,
        label: 'Sample note',
      });
    }

    if (event.type === 'message.delta' && event.chunk) {
      rows.push({
        id: `${event.ts}-assistant`,
        role: 'assistant',
        text: event.chunk,
        ts: event.ts,
        label: 'Sample reply',
      });
    }

    if (event.type === 'tool.request' && event.details) {
      rows.push({
        id: `${event.ts}-system-request`,
        role: 'system',
        text: event.details,
        ts: event.ts,
        label: 'Sample review step',
      });
    }

    if (event.type === 'tool.resolved' && event.result) {
      rows.push({
        id: `${event.ts}-system-result`,
        role: 'system',
        text: event.result === 'approved' ? 'This sample shows an approved step.' : 'This sample shows a denied step.',
        ts: event.ts,
        label: 'Sample result',
      });
    }

    if (event.type === 'session.error' && event.message) {
      rows.push({
        id: `${event.ts}-system-error`,
        role: 'system',
        text: event.message,
        ts: event.ts,
        label: 'Sample update',
      });
    }
  }

  return rows;
}

export default function TerminalSessionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const sessionId = typeof params.id === 'string' ? params.id : '';
  const [session, setSession] = useState<PreviewTerminalSessionDetail | null>(null);
  const [events, setEvents] = useState<PreviewTerminalEvent[]>([]);
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

  const loadSession = useCallback(async (refresh = false) => {
    if (!sessionId) {
      return;
    }

    try {
      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const [nextSession, nextEvents] = await Promise.all([
        fetchPreviewTerminalSession(sessionId),
        fetchPreviewTerminalEvents(sessionId),
      ]);

      setSession(nextSession);
      setEvents(nextEvents);
    } catch (error) {
      setAlertState({
        visible: true,
        title: 'Unable to load this preview',
        message: error instanceof Error ? error.message : 'Try again in a moment.',
        type: 'error',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [sessionId]);

  useFocusEffect(
    useCallback(() => {
      loadSession();
    }, [loadSession])
  );

  const messageRows = useMemo(() => eventsToMessages(events), [events]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={BLUE} />
          <Text style={styles.loadingText}>Opening preview session…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerState}>
          <Text style={styles.emptyTitle}>This preview is unavailable</Text>
          <Pressable style={styles.primaryButton} onPress={() => router.back()}>
            <Text style={styles.primaryButtonText}>Back to terminal</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.iconButton, pressed && styles.buttonPressed]}>
          <Ionicons name="chevron-back" size={22} color={TEXT_PRIMARY} />
        </Pressable>

        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>{session.title}</Text>
          <Text style={styles.headerSubtitle}>{session.agentName}</Text>
        </View>

        <View style={[styles.statusPill, { backgroundColor: statusBackground(session.status), borderColor: statusColor(session.status) }]}>
          <Text style={[styles.statusPillText, { color: statusColor(session.status) }]}>{statusCopy(session.status)}</Text>
        </View>
      </View>

      <View style={styles.sessionSummaryCard}>
        <View style={styles.summaryTopRow}>
          <Text style={styles.summaryTitle}>Sample activity</Text>
          <Text style={styles.summaryMeta}>{refreshing ? 'Refreshing…' : relativeTime(session.lastUpdatedAt)}</Text>
        </View>
        <Text style={styles.summaryBody}>{session.preview}</Text>
      </View>

      <View style={styles.previewNoticeWrap}>
        <PreviewNotice body="This is a sample session. Sending notes and approving actions stay off in this build so the screen cannot act like a live Regent terminal." />
      </View>

      {session.pendingApproval ? (
        <View style={styles.approvalCard}>
          <View style={styles.approvalHeader}>
            <View style={styles.approvalIconWrap}>
              <Ionicons name="eye-outline" size={18} color={ORANGE} />
            </View>
            <View style={styles.approvalCopy}>
              <Text style={styles.approvalTitle}>{session.pendingApproval.label}</Text>
              <Text style={styles.approvalBody}>{session.pendingApproval.details}</Text>
            </View>
          </View>
          <View style={styles.emptyPanel}>
            <Text style={styles.emptyPanelText}>This preview shows where a review step will appear later. The buttons stay off until the live Regent connection is ready.</Text>
          </View>
        </View>
      ) : null}

      <FlatList
        data={messageRows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.chatContent}
        renderItem={({ item }) => (
          <View style={[styles.messageRow, item.role === 'user' ? styles.messageRowUser : styles.messageRowOther]}>
            <View
              style={[
                styles.messageBubble,
                item.role === 'user'
                  ? styles.messageBubbleUser
                  : item.role === 'assistant'
                    ? styles.messageBubbleAssistant
                    : styles.messageBubbleSystem,
              ]}
            >
              <Text style={[styles.messageLabel, item.role === 'user' && styles.messageLabelUser]}>{item.label}</Text>
              <Text style={[styles.messageText, item.role === 'user' ? styles.messageTextUser : styles.messageTextOther]}>
                {item.text}
              </Text>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyTimelineCard}>
            <Text style={styles.emptyTimelineTitle}>This preview is quiet right now</Text>
            <Text style={styles.emptyTimelineText}>New sample updates will appear here when available.</Text>
          </View>
        }
        ListFooterComponent={
          <View style={styles.composerCard}>
            <Text style={styles.composerTitle}>Send a note</Text>
            <Text style={styles.composerBody}>This area stays read-only for now. When the live Regent session is connected, this is where you will reply from your phone.</Text>
            <Pressable
              style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}
              onPress={() =>
                setAlertState({
                  visible: true,
                  title: 'Preview only',
                  message: 'Sending a note is not live in this build yet.',
                  type: 'info',
                })
              }
            >
              <Text style={styles.primaryButtonText}>Not live yet</Text>
            </Pressable>
          </View>
        }
      />

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
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
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
  buttonPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
  headerCopy: {
    flex: 1,
    gap: 2,
  },
  headerTitle: {
    color: TEXT_PRIMARY,
    fontSize: 18,
    lineHeight: 22,
    fontFamily: FONTS.heading,
  },
  headerSubtitle: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: FONTS.body,
  },
  statusPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusPillText: {
    fontSize: 12,
    fontFamily: FONTS.body,
  },
  sessionSummaryCard: {
    marginHorizontal: 20,
    marginBottom: 12,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 22,
    padding: 18,
    gap: 10,
  },
  summaryTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  summaryTitle: {
    color: BLUE,
    fontSize: 16,
    fontFamily: FONTS.heading,
  },
  summaryMeta: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    fontFamily: FONTS.body,
  },
  summaryBody: {
    color: TEXT_PRIMARY,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONTS.body,
  },
  previewNoticeWrap: {
    marginHorizontal: 20,
    marginBottom: 12,
  },
  approvalCard: {
    marginHorizontal: 20,
    marginBottom: 12,
    backgroundColor: BLUE_WASH,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    gap: 14,
  },
  approvalHeader: {
    flexDirection: 'row',
    gap: 12,
  },
  approvalIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: WHITE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approvalCopy: {
    flex: 1,
    gap: 4,
  },
  approvalTitle: {
    color: TEXT_PRIMARY,
    fontSize: 16,
    fontFamily: FONTS.heading,
  },
  approvalBody: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FONTS.body,
  },
  emptyPanel: {
    backgroundColor: WHITE,
    borderRadius: 16,
    padding: 14,
  },
  emptyPanelText: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FONTS.body,
  },
  chatContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 12,
  },
  messageRow: {
    flexDirection: 'row',
  },
  messageRowUser: {
    justifyContent: 'flex-end',
  },
  messageRowOther: {
    justifyContent: 'flex-start',
  },
  messageBubble: {
    maxWidth: '85%',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  messageBubbleUser: {
    backgroundColor: BLUE,
  },
  messageBubbleAssistant: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
  },
  messageBubbleSystem: {
    backgroundColor: BLUE_WASH,
    borderWidth: 1,
    borderColor: BORDER,
  },
  messageLabel: {
    fontSize: 11,
    color: TEXT_SECONDARY,
    fontFamily: FONTS.body,
    textTransform: 'uppercase',
  },
  messageLabelUser: {
    color: 'rgba(255,255,255,0.78)',
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONTS.body,
  },
  messageTextUser: {
    color: WHITE,
  },
  messageTextOther: {
    color: TEXT_PRIMARY,
  },
  emptyTimelineCard: {
    backgroundColor: CARD_BG,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 18,
    gap: 6,
    alignItems: 'center',
  },
  emptyTimelineTitle: {
    color: TEXT_PRIMARY,
    fontSize: 18,
    fontFamily: FONTS.heading,
  },
  emptyTimelineText: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    fontFamily: FONTS.body,
  },
  composerCard: {
    marginTop: 12,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 22,
    padding: 18,
    gap: 10,
  },
  composerTitle: {
    color: TEXT_PRIMARY,
    fontSize: 18,
    fontFamily: FONTS.heading,
  },
  composerBody: {
    color: TEXT_SECONDARY,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONTS.body,
  },
  primaryButton: {
    alignSelf: 'flex-start',
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
});
