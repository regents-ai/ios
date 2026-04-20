import { CoinbaseAlert } from '@/components/ui/CoinbaseAlerts';
import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import { TerminalEvent, TerminalSessionDetail } from '@/types/terminal';
import { fetchTerminalEvents } from '@/utils/fetchTerminalEvents';
import { fetchTerminalSession } from '@/utils/fetchTerminalSession';
import { resolveTerminalApproval } from '@/utils/resolveTerminalApproval';
import { sendTerminalMessage } from '@/utils/sendTerminalMessage';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
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
  CARD_ALT,
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

function statusCopy(status: TerminalSessionDetail['status']) {
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

function statusColor(status: TerminalSessionDetail['status']) {
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

function statusBackground(status: TerminalSessionDetail['status']) {
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

function eventsToMessages(events: TerminalEvent[]): MessageRow[] {
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
        label: 'Agent',
      });
    }

    if (event.type === 'tool.request' && event.details) {
      rows.push({
        id: `${event.ts}-system-request`,
        role: 'system',
        text: event.details,
        ts: event.ts,
        label: 'Approval needed',
      });
    }

    if (event.type === 'tool.resolved' && event.result) {
      rows.push({
        id: `${event.ts}-system-result`,
        role: 'system',
        text: event.result === 'approved' ? 'You approved this request from mobile.' : 'You denied this request from mobile.',
        ts: event.ts,
        label: 'Decision sent',
      });
    }

    if (event.type === 'session.error' && event.message) {
      rows.push({
        id: `${event.ts}-system-error`,
        role: 'system',
        text: event.message,
        ts: event.ts,
        label: 'Session update',
      });
    }
  }

  return rows;
}

export default function TerminalSessionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const sessionId = typeof params.id === 'string' ? params.id : '';
  const [session, setSession] = useState<TerminalSessionDetail | null>(null);
  const [events, setEvents] = useState<TerminalEvent[]>([]);
  const [composerText, setComposerText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [resolvingDecision, setResolvingDecision] = useState<'approved' | 'denied' | null>(null);
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
        fetchTerminalSession(sessionId),
        fetchTerminalEvents(sessionId),
      ]);

      setSession(nextSession);
      setEvents(nextEvents);
    } catch (error) {
      setAlertState({
        visible: true,
        title: 'Unable to load this session',
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

      const interval = setInterval(() => {
        loadSession(true);
      }, 4000);

      return () => clearInterval(interval);
    }, [loadSession])
  );

  const messageRows = useMemo(() => eventsToMessages(events), [events]);

  const handleSend = async () => {
    if (!sessionId || !composerText.trim()) {
      return;
    }

    try {
      setSending(true);
      const nextSession = await sendTerminalMessage(sessionId, composerText.trim());
      setSession(nextSession);
      setComposerText('');
      const nextEvents = await fetchTerminalEvents(sessionId);
      setEvents(nextEvents);
    } catch (error) {
      setAlertState({
        visible: true,
        title: 'Unable to send your note',
        message: error instanceof Error ? error.message : 'Try again in a moment.',
        type: 'error',
      });
    } finally {
      setSending(false);
    }
  };

  const handleApproval = async (decision: 'approved' | 'denied') => {
    if (!session?.pendingApproval) {
      return;
    }

    try {
      setResolvingDecision(decision);
      const nextSession = await resolveTerminalApproval(session.id, session.pendingApproval.requestId, decision);
      setSession(nextSession);
      const nextEvents = await fetchTerminalEvents(session.id);
      setEvents(nextEvents);
      setAlertState({
        visible: true,
        title: decision === 'approved' ? 'Approval sent' : 'Request denied',
        message: decision === 'approved' ? 'The session can keep going now.' : 'The session is waiting for a different direction.',
        type: 'success',
      });
    } catch (error) {
      setAlertState({
        visible: true,
        title: 'Unable to answer that request',
        message: error instanceof Error ? error.message : 'Try again in a moment.',
        type: 'error',
      });
    } finally {
      setResolvingDecision(null);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={BLUE} />
          <Text style={styles.loadingText}>Opening session…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerState}>
          <Text style={styles.emptyTitle}>This session is unavailable</Text>
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
          <Text style={styles.summaryTitle}>Latest activity</Text>
          <Text style={styles.summaryMeta}>{refreshing ? 'Refreshing…' : relativeTime(session.lastUpdatedAt)}</Text>
        </View>
        <Text style={styles.summaryBody}>{session.preview}</Text>
      </View>

      {session.pendingApproval ? (
        <View style={styles.approvalCard}>
          <View style={styles.approvalHeader}>
            <View style={styles.approvalIconWrap}>
              <Ionicons name="key-outline" size={18} color={ORANGE} />
            </View>
            <View style={styles.approvalCopy}>
              <Text style={styles.approvalTitle}>{session.pendingApproval.label}</Text>
              <Text style={styles.approvalBody}>{session.pendingApproval.details}</Text>
            </View>
          </View>
          <View style={styles.approvalActions}>
            <Pressable
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
              onPress={() => handleApproval('denied')}
              disabled={!!resolvingDecision}
            >
              <Text style={styles.secondaryButtonText}>{resolvingDecision === 'denied' ? 'Denying…' : 'Deny'}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}
              onPress={() => handleApproval('approved')}
              disabled={!!resolvingDecision}
            >
              <Text style={styles.primaryButtonText}>{resolvingDecision === 'approved' ? 'Approving…' : 'Approve'}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
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
              <Text style={styles.emptyTimelineTitle}>This session is quiet right now</Text>
              <Text style={styles.emptyTimelineText}>New updates and requests will appear here.</Text>
            </View>
          }
        />

        <View style={styles.composerCard}>
          <Text style={styles.composerTitle}>Send a note</Text>
          <TextInput
            style={styles.input}
            value={composerText}
            onChangeText={setComposerText}
            placeholder={session.composerPlaceholder}
            placeholderTextColor={TEXT_SECONDARY}
            multiline
          />
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              (!composerText.trim() || sending) && styles.primaryButtonDisabled,
              pressed && composerText.trim() && !sending && styles.buttonPressed,
            ]}
            onPress={handleSend}
            disabled={sending || !composerText.trim()}
          >
            <Text style={styles.primaryButtonText}>{sending ? 'Sending…' : 'Send note'}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

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
  flex: {
    flex: 1,
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
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approvalCopy: {
    flex: 1,
    gap: 4,
  },
  approvalTitle: {
    color: BLUE,
    fontSize: 18,
    lineHeight: 22,
    fontFamily: FONTS.heading,
  },
  approvalBody: {
    color: TEXT_PRIMARY,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONTS.body,
  },
  approvalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 12,
  },
  loadingText: {
    color: TEXT_SECONDARY,
    fontSize: 15,
    fontFamily: FONTS.body,
  },
  emptyTitle: {
    color: TEXT_PRIMARY,
    fontSize: 24,
    textAlign: 'center',
    fontFamily: FONTS.heading,
  },
  chatContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
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
    maxWidth: '88%',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
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
    backgroundColor: CARD_ALT,
    borderWidth: 1,
    borderColor: BORDER,
  },
  messageLabel: {
    color: BLUE,
    fontSize: 11,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    fontFamily: FONTS.body,
  },
  messageLabelUser: {
    color: WHITE,
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
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 20,
    padding: 18,
    gap: 6,
  },
  emptyTimelineTitle: {
    color: TEXT_PRIMARY,
    fontSize: 16,
    fontFamily: FONTS.heading,
  },
  emptyTimelineText: {
    color: TEXT_SECONDARY,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONTS.body,
  },
  composerCard: {
    borderTopWidth: 1,
    borderTopColor: BORDER,
    backgroundColor: CARD_BG,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 18,
    gap: 10,
  },
  composerTitle: {
    color: BLUE,
    fontSize: 15,
    fontFamily: FONTS.heading,
  },
  input: {
    minHeight: 92,
    backgroundColor: WHITE,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: TEXT_PRIMARY,
    textAlignVertical: 'top',
    fontSize: 14,
    fontFamily: FONTS.body,
  },
  primaryButton: {
    backgroundColor: BLUE,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.55,
  },
  primaryButtonText: {
    color: WHITE,
    fontSize: 14,
    fontFamily: FONTS.heading,
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
});
