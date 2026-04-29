import { StatusPill } from '@/components/agent-surfaces/StatusPill';
import { CoinbaseAlert } from '@/components/ui/CoinbaseAlerts';
import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import { TerminalEvent, TerminalSessionDetail } from '@/types/terminal';
import { regentApi } from '@/utils/regentApi/client';
import { buildTerminalApprovalSafetyRows } from '@/utils/terminalApprovalSafety';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
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

type TalkDetail = TerminalSessionDetail;
type TalkEvent = TerminalEvent;

function statusCopy(status: TalkDetail['status']) {
  switch (status) {
    case 'idle':
      return 'Ready';
    case 'running':
      return 'Working';
    case 'waiting':
      return 'Needs review';
    case 'failed':
      return 'Attention';
  }
}

function statusColor(status: TalkDetail['status']) {
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

function statusBackground(status: TalkDetail['status']) {
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

function eventsToMessages(events: TalkEvent[]): MessageRow[] {
  const rows: MessageRow[] = [];

  for (const event of events) {
    if (event.type === 'message.user' && event.text) {
      rows.push({
        id: `${event.ts}-user`,
        role: 'user',
        text: event.text,
        ts: event.ts,
        label: 'You',
      });
    }

    if (event.type === 'message.delta' && event.chunk) {
      rows.push({
        id: `${event.ts}-assistant`,
        role: 'assistant',
        text: event.chunk,
        ts: event.ts,
        label: 'Hermes',
      });
    }

    if (event.type === 'tool.request' && event.riskCopy) {
      rows.push({
        id: `${event.ts}-system-request`,
        role: 'system',
        text: event.riskCopy,
        ts: event.ts,
        label: 'Approval',
      });
    }

    if (event.type === 'tool.resolved' && event.result) {
      rows.push({
        id: `${event.ts}-system-result`,
        role: 'system',
        text:
          event.result === 'approved'
            ? 'Approved.'
            : event.result === 'denied'
              ? 'Declined.'
              : 'This request expired before a decision was made.',
        ts: event.ts,
        label: 'Decision',
      });
    }

    if (event.type === 'session.error' && event.message) {
      rows.push({
        id: `${event.ts}-system-error`,
        role: 'system',
        text: event.message,
        ts: event.ts,
        label: 'Update',
      });
    }
  }

  return rows;
}

function ApprovalSafetySummary({ talk }: { talk: TalkDetail }) {
  if (!talk.pendingApproval) {
    return null;
  }

  const safetyRows = buildTerminalApprovalSafetyRows({
    agentName: talk.agentName,
    approval: talk.pendingApproval,
  });

  return (
    <View style={styles.safetyPanel}>
      {safetyRows.map((row) => (
        <View key={row.label} style={styles.safetyRow}>
          <Text style={styles.safetyLabel}>{row.label}</Text>
          <Text style={styles.safetyValue}>{row.value}</Text>
        </View>
      ))}
    </View>
  );
}

export default function TalkDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const talkId = typeof params.id === 'string' ? params.id : '';
  const [talk, setTalk] = useState<TalkDetail | null>(null);
  const [events, setEvents] = useState<TalkEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [resolvingApproval, setResolvingApproval] = useState<'approved' | 'denied' | null>(null);
  const latestEventIdRef = useRef('');
  const pollingRef = useRef(false);
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

  const loadTalk = useCallback(async (refresh = false) => {
    if (!talkId) {
      return;
    }

    try {
      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const [nextTalk, nextEventsPayload] = await Promise.all([
        regentApi.getTerminalSession(talkId),
        regentApi.getTerminalEvents(talkId),
      ]);

      setTalk(nextTalk);
      setEvents(nextEventsPayload.events);
      latestEventIdRef.current = nextEventsPayload.latestEventId;
    } catch (error) {
      setAlertState({
        visible: true,
        title: 'Unable to load this talk',
        message: error instanceof Error ? error.message : 'Try again in a moment.',
        type: 'error',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [talkId]);

  useFocusEffect(
    useCallback(() => {
      latestEventIdRef.current = '';
      loadTalk();
    }, [loadTalk])
  );

  useEffect(() => {
    if (!talkId || loading) {
      return;
    }

    const poll = async () => {
      if (pollingRef.current) {
        return;
      }

      try {
        pollingRef.current = true;
        const [nextTalk, nextEventsPayload] = await Promise.all([
          regentApi.getTerminalSession(talkId),
          regentApi.getTerminalEvents(talkId, latestEventIdRef.current || undefined),
        ]);
        setTalk(nextTalk);
        if (nextEventsPayload.events.length > 0) {
          setEvents((current) => [...current, ...nextEventsPayload.events]);
        }
        latestEventIdRef.current = nextEventsPayload.latestEventId;
      } catch (error) {
        void error;
      } finally {
        pollingRef.current = false;
      }
    };

    const interval = setInterval(poll, 4000);
    return () => clearInterval(interval);
  }, [loading, talkId]);

  const messageRows = useMemo(() => eventsToMessages(events), [events]);

  const submitReply = useCallback(async () => {
    const text = replyText.trim();
    if (!talkId || !text || sendingReply) {
      return;
    }

    try {
      setSendingReply(true);
      const nextTalk = await regentApi.sendTerminalMessage(talkId, text);
      const nextEvents = await regentApi.getTerminalEvents(talkId);
      setTalk(nextTalk);
      setEvents(nextEvents.events);
      latestEventIdRef.current = nextEvents.latestEventId;
      setReplyText('');
    } catch (error) {
      setAlertState({
        visible: true,
        title: 'Unable to send reply',
        message: error instanceof Error ? error.message : 'Try again in a moment.',
        type: 'error',
      });
    } finally {
      setSendingReply(false);
    }
  }, [replyText, sendingReply, talkId]);

  const resolveApproval = useCallback(async (decision: 'approved' | 'denied') => {
    const requestId = talk?.pendingApproval?.requestId;
    if (!talkId || !requestId || resolvingApproval) {
      return;
    }

    try {
      setResolvingApproval(decision);
      const nextTalk = await regentApi.resolveTerminalApproval(talkId, requestId, decision);
      const nextEvents = await regentApi.getTerminalEvents(talkId);
      setTalk(nextTalk);
      setEvents(nextEvents.events);
      latestEventIdRef.current = nextEvents.latestEventId;
      setAlertState({
        visible: true,
        title: decision === 'approved' ? 'Approved' : 'Declined',
        message: decision === 'approved' ? 'The review was approved.' : 'The review was declined.',
        type: decision === 'approved' ? 'success' : 'info',
      });
    } catch (error) {
      setAlertState({
        visible: true,
        title: 'Unable to save decision',
        message: error instanceof Error ? error.message : 'Try again in a moment.',
        type: 'error',
      });
    } finally {
      setResolvingApproval(null);
    }
  }, [resolvingApproval, talk?.pendingApproval?.requestId, talkId]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={BLUE} />
          <Text style={styles.loadingText}>Opening talk…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!talk) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerState}>
          <Text style={styles.emptyTitle}>This talk is unavailable</Text>
          <Pressable style={styles.primaryButton} onPress={() => router.back()}>
            <Text style={styles.primaryButtonText}>Go back</Text>
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
          <Text style={styles.headerTitle}>{talk.title}</Text>
          <Text style={styles.headerSubtitle}>{talk.agentName}</Text>
        </View>

        <StatusPill
          label={statusCopy(talk.status)}
          color={statusColor(talk.status)}
          backgroundColor={statusBackground(talk.status)}
          borderColor={statusColor(talk.status)}
        />
      </View>

      <View style={styles.sessionSummaryCard}>
        <View style={styles.summaryTopRow}>
          <Text style={styles.summaryTitle}>Latest activity</Text>
          <Text style={styles.summaryMeta}>{refreshing ? 'Refreshing…' : relativeTime(talk.lastUpdatedAt)}</Text>
        </View>
        <Text style={styles.summaryBody}>{talk.latestNote}</Text>
      </View>

      {talk.pendingApproval ? (
        <View style={styles.approvalCard}>
          <View style={styles.approvalHeader}>
            <View style={styles.approvalIconWrap}>
              <Ionicons name="eye-outline" size={18} color={ORANGE} />
            </View>
            <View style={styles.approvalCopy}>
              <Text style={styles.approvalTitle}>{talk.pendingApproval.action}</Text>
              <Text style={styles.approvalBody}>{talk.pendingApproval.riskCopy}</Text>
            </View>
          </View>
          <ApprovalSafetySummary talk={talk} />
          <View style={styles.approvalActions}>
            <Pressable
              style={({ pressed }) => [styles.denyButton, pressed && styles.buttonPressed]}
              disabled={!!resolvingApproval}
              onPress={() => resolveApproval('denied')}
            >
              <Text style={styles.denyButtonText}>{resolvingApproval === 'denied' ? 'Declining…' : 'Decline'}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.approveButton, pressed && styles.buttonPressed]}
              disabled={!!resolvingApproval}
              onPress={() => resolveApproval('approved')}
            >
              <Text style={styles.approveButtonText}>{resolvingApproval === 'approved' ? 'Approving…' : 'Approve'}</Text>
            </Pressable>
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
            <Text style={styles.emptyTimelineTitle}>No activity yet</Text>
            <Text style={styles.emptyTimelineText}>Updates will appear here when this talk has something new.</Text>
          </View>
        }
        ListFooterComponent={
          <View style={styles.composerCard}>
            <Text style={styles.composerTitle}>Reply</Text>
            <TextInput
              value={replyText}
              onChangeText={setReplyText}
              placeholder={talk.composerPlaceholder}
              placeholderTextColor={TEXT_SECONDARY}
              multiline
              style={styles.composerInput}
            />
            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                (!replyText.trim() || sendingReply) && styles.primaryButtonDisabled,
                pressed && styles.buttonPressed,
              ]}
              disabled={!replyText.trim() || sendingReply}
              onPress={submitReply}
            >
              <Text style={styles.primaryButtonText}>{sendingReply ? 'Sending…' : 'Send reply'}</Text>
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
  safetyPanel: {
    backgroundColor: WHITE,
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  safetyRow: {
    gap: 4,
  },
  safetyLabel: {
    color: BLUE,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: FONTS.body,
    textTransform: 'uppercase',
  },
  safetyValue: {
    color: TEXT_PRIMARY,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FONTS.body,
  },
  approvalActions: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  approveButton: {
    flex: 1,
    minWidth: 130,
    backgroundColor: BLUE,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  approveButtonText: {
    color: WHITE,
    fontSize: 14,
    fontFamily: FONTS.body,
  },
  denyButton: {
    flex: 1,
    minWidth: 130,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  denyButtonText: {
    color: TEXT_PRIMARY,
    fontSize: 14,
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
  composerInput: {
    backgroundColor: BLUE_WASH,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 92,
    color: TEXT_PRIMARY,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONTS.body,
    textAlignVertical: 'top',
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
  primaryButtonDisabled: {
    opacity: 0.55,
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
