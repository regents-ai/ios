import { StatusPill } from '@/components/agent-surfaces/StatusPill';
import { SpinningRefreshIcon } from '@/components/motion/SpinningRefreshIcon';
import { CoinbaseAlert } from '@/components/ui/CoinbaseAlerts';
import { RegentPressable } from '@/components/ui/RegentPressable';
import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import {
  PendingTerminalApproval,
  TerminalEvent,
  TerminalSessionDetail,
  TerminalSessionStatus,
} from '@/types/regents';
import { routes } from '@/utils/navigation/routes';
import { regentApi } from '@/utils/regentApi/client';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

const { DARK_BG, CARD_BG, CARD_ALT, TEXT_PRIMARY, TEXT_SECONDARY, BLUE, BORDER, WHITE, SUCCESS, DANGER, BLUE_WASH } = COLORS;
const AMBER = '#A3703A';
const AMBER_WASH = '#F2E7DA';
const GREEN_WASH = '#E6F0EA';
const RED_WASH = '#F3E1DD';

function formatEventTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return '';
  }

  return date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function statusTone(status: TerminalSessionStatus) {
  switch (status) {
    case 'running':
      return { label: 'Working', accent: BLUE, wash: BLUE_WASH };
    case 'waiting':
      return { label: 'Review', accent: AMBER, wash: AMBER_WASH };
    case 'failed':
      return { label: 'Needs help', accent: DANGER, wash: RED_WASH };
    case 'idle':
      return { label: 'Open', accent: SUCCESS, wash: GREEN_WASH };
  }
}

function eventCopy(event: TerminalEvent) {
  return event.text || event.chunk || event.message || event.riskCopy || event.status || event.type;
}

function eventTitle(event: TerminalEvent) {
  if (event.type === 'tool.request' && event.amount && event.currency) return 'Payment requested';
  if (event.type === 'tool.request') return 'Review requested';
  if (event.type === 'tool.resolved') return 'Review updated';
  if (event.type === 'session.error') return 'Needs attention';
  if (event.role === 'user') return 'You';
  if (event.role === 'assistant') return 'Regent';
  return 'Review';
}

function approvalMeta(approval: PendingTerminalApproval) {
  const parts = [
    approval.amount && approval.currency ? `${approval.amount} ${approval.currency}` : null,
    approval.contractAddress ? `${approval.contractAddress.slice(0, 8)}...${approval.contractAddress.slice(-6)}` : null,
  ].filter(Boolean);

  return parts.join(' · ');
}

function approvalTitle(approval: PendingTerminalApproval) {
  return approval.amount && approval.currency
    ? `Agent requests ${approval.amount} ${approval.currency}`
    : approval.action;
}

function approvalPurpose(approval: PendingTerminalApproval) {
  return approval.amount && approval.currency ? approval.action : null;
}

export default function TalkDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const sessionId = typeof params.id === 'string' ? params.id : '';
  const [session, setSession] = useState<TerminalSessionDetail | null>(null);
  const [events, setEvents] = useState<TerminalEvent[]>([]);
  const [latestEventId, setLatestEventId] = useState('');
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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
        regentApi.getTerminalSession(sessionId),
        regentApi.getTerminalEvents({ sessionId }),
      ]);
      setSession(nextSession);
      setEvents(nextEvents.events);
      setLatestEventId(nextEvents.latestEventId);
    } catch (error) {
      setAlertState({
        visible: true,
        title: 'Could not load reviews',
        message: error instanceof Error ? error.message : 'Try again in a moment.',
        type: 'error',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [sessionId]);

  const refreshNewEvents = useCallback(async () => {
    if (!sessionId) {
      return;
    }

    const nextEvents = await regentApi.getTerminalEvents({ sessionId, sinceEventId: latestEventId || undefined });
    if (nextEvents.events.length > 0) {
      setEvents((current) => {
        const seen = new Set(current.map((event) => event.eventId));
        return [...current, ...nextEvents.events.filter((event) => !seen.has(event.eventId))];
      });
      setLatestEventId(nextEvents.latestEventId);
    }
  }, [latestEventId, sessionId]);

  useFocusEffect(
    useCallback(() => {
      loadSession();
    }, [loadSession])
  );

  const tone = statusTone(session?.status || 'idle');
  const visibleEvents = useMemo(
    () => events.filter((event) => !!eventCopy(event)),
    [events]
  );

  const sendMessage = useCallback(async () => {
    const text = draft.trim();
    if (!sessionId || !text || sending) {
      return;
    }

    try {
      setSending(true);
      const nextSession = await regentApi.sendTerminalMessage({ sessionId, text });
      setSession(nextSession);
      setDraft('');
      if (nextSession.id !== sessionId) {
        router.replace(routes.terminalSession(nextSession.id));
        return;
      }

      await loadSession(true);
    } catch (error) {
      setAlertState({
        visible: true,
        title: 'Could not send message',
        message: error instanceof Error ? error.message : 'Try again in a moment.',
        type: 'error',
      });
    } finally {
      setSending(false);
    }
  }, [draft, loadSession, router, sending, sessionId]);

  const resolveApproval = useCallback(async (decision: 'approved' | 'denied') => {
    const requestId = session?.pendingApproval?.requestId;
    if (!sessionId || !requestId || resolvingDecision) {
      return;
    }

    try {
      setResolvingDecision(decision);
      const nextSession = await regentApi.resolveTerminalApproval({ sessionId, requestId, decision });
      setSession(nextSession);
      await loadSession(true);
    } catch (error) {
      setAlertState({
        visible: true,
        title: 'Could not update review',
        message: error instanceof Error ? error.message : 'Try again in a moment.',
        type: 'error',
      });
    } finally {
      setResolvingDecision(null);
    }
  }, [loadSession, resolvingDecision, session, sessionId]);

  const pendingApproval = session?.pendingApproval;
  const isPaymentApproval = !!pendingApproval?.amount && !!pendingApproval.currency;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardWrap}
      >
        <View style={styles.header}>
          <RegentPressable pressStyle="icon" onPress={() => router.back()} style={styles.iconButton}>
            <Ionicons name="chevron-back" size={22} color={TEXT_PRIMARY} />
          </RegentPressable>
          <View style={styles.headerTitleGroup}>
            <Text style={styles.headerEyebrow}>Review</Text>
            <Text style={styles.headerTitle} numberOfLines={1}>{session?.agentName || 'Session'}</Text>
          </View>
          <RegentPressable
            pressStyle="icon"
            onPress={() => loadSession(true)}
            disabled={refreshing}
            style={styles.iconButton}
          >
            <SpinningRefreshIcon refreshing={refreshing} size={18} color={BLUE} />
          </RegentPressable>
        </View>

        <ScrollView
          style={styles.scroller}
          contentContainerStyle={styles.content}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor={BLUE}
              onRefresh={() => loadSession(true)}
            />
          }
        >
          {loading ? (
            <View style={styles.emptyState}>
              <ActivityIndicator color={BLUE} />
              <Text style={styles.emptyTitle}>Loading reviews</Text>
            </View>
          ) : session ? (
            <>
              <View style={styles.sessionCard}>
                <View style={styles.sessionHeader}>
                  <View style={styles.sessionTitleGroup}>
                    <Text style={styles.sessionTitle}>{session.title}</Text>
                    <Text style={styles.sessionNote}>{session.latestNote}</Text>
                  </View>
                  <StatusPill label={tone.label} color={tone.accent} backgroundColor={tone.wash} compact />
                </View>
              </View>

              {pendingApproval && !pendingApproval.resolved ? (
                <View style={styles.approvalCard}>
                  <View style={styles.approvalHeader}>
                    <View style={styles.approvalIcon}>
                      <Ionicons name="eye-outline" size={18} color={AMBER} />
                    </View>
                    <View style={styles.approvalTitleGroup}>
                      <Text style={styles.approvalTitle}>{approvalTitle(pendingApproval)}</Text>
                      <Text style={styles.approvalAgent}>{pendingApproval.regentName}</Text>
                    </View>
                  </View>
                  {approvalPurpose(pendingApproval) ? (
                    <Text style={styles.approvalPurpose}>Purpose: {approvalPurpose(pendingApproval)}</Text>
                  ) : null}
                  <Text style={styles.approvalBody}>{pendingApproval.riskCopy}</Text>
                  {approvalMeta(pendingApproval) ? (
                    <Text style={styles.approvalMeta}>{approvalMeta(pendingApproval)}</Text>
                  ) : null}
                  <View style={styles.approvalActions}>
                    <RegentPressable
                      style={styles.secondaryButton}
                      disabled={!!resolvingDecision}
                      onPress={() => resolveApproval('denied')}
                    >
                      <Text style={styles.secondaryButtonText}>
                        {resolvingDecision === 'denied' ? 'Saving...' : 'Deny'}
                      </Text>
                    </RegentPressable>
                    <RegentPressable
                      style={styles.primaryButton}
                      disabled={!!resolvingDecision}
                      onPress={() => resolveApproval('approved')}
                    >
                      <Text style={styles.primaryButtonText}>
                        {resolvingDecision === 'approved' ? 'Saving...' : isPaymentApproval ? 'Approve payment' : 'Approve'}
                      </Text>
                    </RegentPressable>
                  </View>
                </View>
              ) : null}

              <View style={styles.eventList}>
                {visibleEvents.length === 0 ? (
                  <View style={styles.emptyEventState}>
                    <Text style={styles.emptyTitle}>No messages yet</Text>
                    <Text style={styles.emptyBody}>Send a note to start the review.</Text>
                  </View>
                ) : (
                  visibleEvents.map((event) => (
                    <View key={event.eventId} style={[
                      styles.eventCard,
                      event.role === 'user' && styles.userEventCard,
                    ]}>
                      <View style={styles.eventHeader}>
                        <Text style={styles.eventTitle}>{eventTitle(event)}</Text>
                        <Text style={styles.eventTime}>{formatEventTime(event.ts)}</Text>
                      </View>
                      <Text style={styles.eventBody}>{eventCopy(event)}</Text>
                    </View>
                  ))
                )}
              </View>

              <RegentPressable
                style={styles.refreshSmallButton}
                onPress={refreshNewEvents}
              >
                <Text style={styles.refreshSmallText}>Check for new messages</Text>
              </RegentPressable>
            </>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Review not found</Text>
              <Text style={styles.emptyBody}>Go back and choose another review.</Text>
            </View>
          )}
        </ScrollView>

        {session ? (
          <View style={styles.composer}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={session.composerPlaceholder || 'Message this agent...'}
              placeholderTextColor={TEXT_SECONDARY}
              multiline
              style={styles.composerInput}
            />
            <RegentPressable
              pressStyle="icon"
              style={[styles.sendButton, (!draft.trim() || sending) && styles.sendButtonDisabled]}
              disabled={!draft.trim() || sending}
              onPress={sendMessage}
            >
              {sending ? (
                <ActivityIndicator color={WHITE} size="small" />
              ) : (
                <Ionicons name="paper-plane-outline" size={18} color={WHITE} />
              )}
            </RegentPressable>
          </View>
        ) : null}
      </KeyboardAvoidingView>

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
  keyboardWrap: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 10,
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
  headerTitleGroup: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: 2,
  },
  headerEyebrow: {
    color: BLUE,
    fontSize: 11,
    textTransform: 'uppercase',
    fontFamily: FONTS.body,
  },
  headerTitle: {
    color: TEXT_PRIMARY,
    fontSize: 20,
    lineHeight: 24,
    fontFamily: FONTS.heading,
  },
  scroller: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 18,
    gap: 14,
  },
  sessionCard: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 20,
    padding: 16,
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
    gap: 8,
  },
  sessionTitle: {
    color: TEXT_PRIMARY,
    fontSize: 22,
    lineHeight: 26,
    fontFamily: FONTS.heading,
  },
  sessionNote: {
    color: TEXT_SECONDARY,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONTS.body,
  },
  approvalCard: {
    backgroundColor: AMBER_WASH,
    borderWidth: 1,
    borderColor: '#D4B68A',
    borderRadius: 20,
    padding: 16,
    gap: 12,
  },
  approvalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  approvalIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: WHITE,
  },
  approvalTitleGroup: {
    flex: 1,
    minWidth: 0,
  },
  approvalTitle: {
    color: TEXT_PRIMARY,
    fontSize: 18,
    lineHeight: 22,
    fontFamily: FONTS.heading,
  },
  approvalAgent: {
    color: AMBER,
    fontSize: 12,
    fontFamily: FONTS.body,
  },
  approvalPurpose: {
    color: TEXT_PRIMARY,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: FONTS.body,
  },
  approvalBody: {
    color: TEXT_PRIMARY,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONTS.body,
  },
  approvalMeta: {
    color: AMBER,
    fontSize: 12,
    fontFamily: FONTS.body,
  },
  approvalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BLUE,
  },
  primaryButtonText: {
    color: WHITE,
    fontSize: 14,
    fontFamily: FONTS.heading,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
  },
  secondaryButtonText: {
    color: TEXT_PRIMARY,
    fontSize: 14,
    fontFamily: FONTS.heading,
  },
  eventList: {
    gap: 10,
  },
  eventCard: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 18,
    padding: 14,
    gap: 8,
  },
  userEventCard: {
    backgroundColor: CARD_ALT,
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  eventTitle: {
    flex: 1,
    color: TEXT_PRIMARY,
    fontSize: 14,
    fontFamily: FONTS.heading,
  },
  eventTime: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    fontFamily: FONTS.body,
  },
  eventBody: {
    color: TEXT_SECONDARY,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONTS.body,
  },
  refreshSmallButton: {
    alignSelf: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD_BG,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  refreshSmallText: {
    color: BLUE,
    fontSize: 13,
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
  emptyEventState: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 20,
    padding: 22,
    gap: 6,
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
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 18 : 12,
    backgroundColor: DARK_BG,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  composerInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD_BG,
    color: TEXT_PRIMARY,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONTS.body,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
});
