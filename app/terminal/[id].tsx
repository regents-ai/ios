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

const { DARK_BG, CARD_BG, CARD_ALT, TEXT_PRIMARY, TEXT_SECONDARY, BLUE, BORDER, WHITE, SUCCESS, DANGER, BLUE_WASH } = COLORS;

type MessageRow = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  ts: string;
};

function statusCopy(status: TerminalSessionDetail['status']) {
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

function statusColor(status: TerminalSessionDetail['status']) {
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

function eventsToMessages(events: TerminalEvent[]): MessageRow[] {
  const rows: MessageRow[] = [];

  for (const event of events) {
    if (event.type === 'message.user' && event.text) {
      rows.push({
        id: `${event.ts}-user`,
        role: 'user',
        text: event.text,
        ts: event.ts,
      });
    }

    if (event.type === 'message.delta' && event.chunk) {
      rows.push({
        id: `${event.ts}-assistant`,
        role: 'assistant',
        text: event.chunk,
        ts: event.ts,
      });
    }

    if (event.type === 'tool.request' && event.details) {
      rows.push({
        id: `${event.ts}-system-request`,
        role: 'system',
        text: event.details,
        ts: event.ts,
      });
    }

    if (event.type === 'tool.resolved' && event.result) {
      rows.push({
        id: `${event.ts}-system-result`,
        role: 'system',
        text: event.result === 'approved' ? 'Approval granted from mobile.' : 'Approval denied from mobile.',
        ts: event.ts,
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

  const loadSession = useCallback(async () => {
    if (!sessionId) {
      return;
    }

    try {
      setLoading(true);
      const [nextSession, nextEvents] = await Promise.all([
        fetchTerminalSession(sessionId),
        fetchTerminalEvents(sessionId),
      ]);

      setSession(nextSession);
      setEvents(nextEvents);
    } catch (error) {
      setAlertState({
        visible: true,
        title: 'Unable to load session',
        message: error instanceof Error ? error.message : 'Try again in a moment.',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useFocusEffect(
    useCallback(() => {
      loadSession();

      const interval = setInterval(() => {
        loadSession();
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
        title: 'Unable to send message',
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
        message: decision === 'approved' ? 'The session can continue now.' : 'The session is waiting for a new direction.',
        type: 'success',
      });
    } catch (error) {
      setAlertState({
        visible: true,
        title: 'Unable to resolve request',
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
          <Text style={styles.loadingText}>Loading session…</Text>
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
        <Pressable onPress={() => router.back()} style={styles.iconButton}>
          <Ionicons name="chevron-back" size={22} color={TEXT_PRIMARY} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>{session.title}</Text>
          <Text style={styles.headerSubtitle}>{session.agentName}</Text>
        </View>
        <View style={[styles.statusPill, { borderColor: statusColor(session.status) }]}>
          <Text style={[styles.statusPillText, { color: statusColor(session.status) }]}>{statusCopy(session.status)}</Text>
        </View>
      </View>

      {session.pendingApproval ? (
        <View style={styles.approvalCard}>
          <Text style={styles.approvalTitle}>{session.pendingApproval.label}</Text>
          <Text style={styles.approvalBody}>{session.pendingApproval.details}</Text>
          <View style={styles.approvalActions}>
            <Pressable
              style={styles.secondaryButton}
              onPress={() => handleApproval('denied')}
              disabled={!!resolvingDecision}
            >
              <Text style={styles.secondaryButtonText}>{resolvingDecision === 'denied' ? 'Denying…' : 'Deny'}</Text>
            </Pressable>
            <Pressable
              style={styles.primaryButton}
              onPress={() => handleApproval('approved')}
              disabled={!!resolvingDecision}
            >
              <Text style={styles.primaryButtonText}>{resolvingDecision === 'approved' ? 'Approving…' : 'Approve'}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <FlatList
          data={messageRows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.chatContent}
          renderItem={({ item }) => (
            <View style={[styles.messageRow, item.role === 'user' ? styles.messageRowUser : styles.messageRowSystem]}>
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
                <Text
                  style={[
                    styles.messageText,
                    item.role === 'user' ? styles.messageTextUser : styles.messageTextOther,
                  ]}
                >
                  {item.text}
                </Text>
              </View>
            </View>
          )}
        />

        <View style={styles.composerCard}>
          <TextInput
            style={styles.input}
            value={composerText}
            onChangeText={setComposerText}
            placeholder={session.composerPlaceholder}
            placeholderTextColor={TEXT_SECONDARY}
            multiline
          />
          <Pressable style={styles.primaryButton} onPress={handleSend} disabled={sending || !composerText.trim()}>
            <Text style={styles.primaryButtonText}>{sending ? 'Sending…' : 'Send'}</Text>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 12,
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
  headerCopy: {
    flex: 1,
  },
  headerTitle: {
    color: TEXT_PRIMARY,
    fontSize: 18,
    fontFamily: FONTS.heading,
  },
  headerSubtitle: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    marginTop: 2,
    fontFamily: FONTS.body,
  },
  statusPill: {
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
  approvalCard: {
    marginHorizontal: 20,
    marginBottom: 12,
    backgroundColor: BLUE_WASH,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    gap: 10,
  },
  approvalTitle: {
    color: BLUE,
    fontSize: 18,
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
    fontSize: 24,
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
  messageRowSystem: {
    justifyContent: 'flex-start',
  },
  messageBubble: {
    maxWidth: '86%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
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
  composerCard: {
    borderTopWidth: 1,
    borderTopColor: BORDER,
    backgroundColor: CARD_BG,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 18,
    gap: 12,
  },
  input: {
    minHeight: 92,
    backgroundColor: WHITE,
    borderRadius: 16,
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
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
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
});
