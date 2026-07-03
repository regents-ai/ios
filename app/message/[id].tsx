import { StatusPill } from '@/components/agent-surfaces/StatusPill';
import { SpinningRefreshIcon } from '@/components/motion/SpinningRefreshIcon';
import { ThreadSkeleton } from '@/components/motion/ThreadSkeleton';
import { TypingIndicator } from '@/components/motion/TypingIndicator';
import { CoinbaseAlert } from '@/components/ui/CoinbaseAlerts';
import { runRegentEventHaptic } from '@/components/ui/haptics';
import { JumpToLatestButton } from '@/components/ui/JumpToLatestButton';
import { RegentPressable } from '@/components/ui/RegentPressable';
import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import {
  PendingMessageApproval,
  MessageThreadEvent,
  MessageThreadDetail,
  MessageThreadStatus,
} from '@/types/regents';
import { routes } from '@/utils/navigation/routes';
import { regentApi } from '@/utils/regentApi/client';
import {
  createChatScrollState,
  jumpToLatest,
  noteUserScrollStart,
  shouldAutoScroll,
  shouldShowJumpToLatest,
  trackChatScroll,
} from '@/utils/chatScrollPolicy';
import {
  adoptMessageThreadId,
  completeMessagePoll,
  extendMessagePollBurst,
  mergeMessageThreadEvents,
  nextMessagePollDelay,
} from '@/utils/regentApi/messagePolling';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  type ListRenderItem,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  RefreshControl,
  SafeAreaView,
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

function statusTone(status: MessageThreadStatus) {
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

function eventCopy(event: MessageThreadEvent) {
  return event.text || event.chunk || event.message || event.riskCopy || event.status || event.type;
}

function eventTitle(event: MessageThreadEvent) {
  if (event.type === 'tool.request' && event.amount && event.currency) return 'Payment requested';
  if (event.type === 'tool.request') return 'Approval requested';
  if (event.type === 'tool.resolved') return 'Approval updated';
  if (event.type === 'session.error') return 'Needs attention';
  if (event.role === 'user') return 'You';
  if (event.role === 'assistant') return 'Regent';
  return 'Message';
}

function approvalTitle(approval: PendingMessageApproval) {
  return approval.amount && approval.currency
    ? `Agent requests ${approval.amount} ${approval.currency}`
    : approvalActionLabel(approval);
}

function approvalActionLabel(approval: PendingMessageApproval) {
  const plain = approval.action.replace(/[_-]+/g, ' ').trim();
  return plain ? plain.charAt(0).toUpperCase() + plain.slice(1) : 'Review request';
}

function approvalAmountLabel(approval: PendingMessageApproval) {
  if (!approval.amount || !approval.currency) {
    return null;
  }

  const base = `${approval.amount} ${approval.currency}`;
  return approval.amountUsd ? `${base} · $${approval.amountUsd} USD` : base;
}

function approvalContractLabel(approval: PendingMessageApproval) {
  if (!approval.contractAddress) {
    return null;
  }

  return `${approval.contractAddress.slice(0, 8)}...${approval.contractAddress.slice(-6)}`;
}

function approvalExpiresAtMs(approval: PendingMessageApproval) {
  if (!approval.expiresAt) {
    return null;
  }

  const expiresAtMs = new Date(approval.expiresAt).getTime();
  return Number.isFinite(expiresAtMs) ? expiresAtMs : null;
}

function isApprovalExpired(approval: PendingMessageApproval, nowMs: number) {
  const expiresAtMs = approvalExpiresAtMs(approval);
  return expiresAtMs !== null && expiresAtMs <= nowMs;
}

function approvalExpiryLabel(approval: PendingMessageApproval, nowMs: number) {
  const expiresAtMs = approvalExpiresAtMs(approval);
  if (expiresAtMs === null) {
    return null;
  }

  const remainingMs = expiresAtMs - nowMs;
  if (remainingMs <= 0) {
    return 'Expired';
  }

  const minutes = Math.ceil(remainingMs / 60_000);
  if (minutes < 2) {
    return 'In less than a minute';
  }
  if (minutes < 60) {
    return `In ${minutes} minutes`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return hours === 1 ? 'In about 1 hour' : `In about ${hours} hours`;
  }

  const days = Math.round(hours / 24);
  return days === 1 ? 'In about 1 day' : `In about ${days} days`;
}

type MessageEventRowProps = {
  event: MessageThreadEvent;
};

const MessageEventRow = memo(function MessageEventRow({
  event,
}: MessageEventRowProps) {
  return (
    <View style={[
      styles.eventCard,
      event.role === 'user' && styles.userEventCard,
    ]}>
      <View style={styles.eventHeader}>
        <Text style={styles.eventTitle}>{eventTitle(event)}</Text>
        <Text style={styles.eventTime}>{formatEventTime(event.ts)}</Text>
      </View>
      <Text style={styles.eventBody}>{eventCopy(event)}</Text>
    </View>
  );
});

function EventSeparator() {
  return <View style={styles.eventSeparator} />;
}

function keyEvent(event: MessageThreadEvent) {
  return event.eventId;
}

export default function MessageDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const routeThreadId = typeof params.id === 'string' ? params.id : '';
  const eventListRef = useRef<FlatList<MessageThreadEvent>>(null);
  const previousEventCountRef = useRef(0);
  const previousThreadScrollKeyRef = useRef('');
  const scrollPolicyRef = useRef(createChatScrollState());
  const jumpPillVisibleRef = useRef(false);
  const streamingRef = useRef(false);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [effectiveThreadId, setEffectiveThreadId] = useState(routeThreadId);
  const [thread, setThread] = useState<MessageThreadDetail | null>(null);
  const [events, setEvents] = useState<MessageThreadEvent[]>([]);
  const [latestEventId, setLatestEventId] = useState('');
  const [pollBurstUntilMs, setPollBurstUntilMs] = useState(0);
  const [pollTick, setPollTick] = useState(0);
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

  useEffect(() => {
    setEffectiveThreadId(routeThreadId);
    setLatestEventId('');
    setPollBurstUntilMs(0);
    setPollTick((current) => current + 1);
  }, [routeThreadId]);

  const moveToThread = useCallback((nextThreadId: string) => {
    setEffectiveThreadId(nextThreadId);
    if (nextThreadId && nextThreadId !== routeThreadId) {
      router.replace(routes.messageThread(nextThreadId));
    }
  }, [routeThreadId, router]);

  const loadThread = useCallback(async (refresh = false, requestedThreadId = effectiveThreadId || routeThreadId) => {
    if (!requestedThreadId) {
      return;
    }

    try {
      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const nextThread = await regentApi.getMessageThread(requestedThreadId);
      const nextThreadId = adoptMessageThreadId(requestedThreadId, nextThread.id);
      moveToThread(nextThreadId);

      const nextEvents = await regentApi.getMessageThreadEvents({ threadId: nextThreadId });
      setThread(nextThread);
      setEvents(mergeMessageThreadEvents([], nextEvents.events));
      setLatestEventId(nextEvents.latestEventId);
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
  }, [effectiveThreadId, moveToThread, routeThreadId]);

  const refreshNewEvents = useCallback(async () => {
    const requestThreadId = effectiveThreadId || routeThreadId;
    if (!requestThreadId) {
      return 0;
    }

    const nextEvents = await regentApi.getMessageThreadEvents({ threadId: requestThreadId, sinceEventId: latestEventId || undefined });
    if (nextEvents.events.length > 0) {
      setEvents((current) => mergeMessageThreadEvents(current, nextEvents.events));
    }
    setLatestEventId(nextEvents.latestEventId);
    return nextEvents.events.length;
  }, [effectiveThreadId, latestEventId, routeThreadId]);

  useFocusEffect(
    useCallback(() => {
      loadThread();
    }, [loadThread])
  );

  useEffect(() => {
    const requestThreadId = effectiveThreadId || routeThreadId;
    if (!requestThreadId || loading) {
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      refreshNewEvents()
        .then((receivedEventCount) => {
          if (cancelled) {
            return;
          }

          const completed = completeMessagePoll({
            currentTick: pollTick,
            receivedEventCount,
          });
          if (completed.burstUntilMs) {
            setPollBurstUntilMs(completed.burstUntilMs);
          }
          setPollTick(completed.nextTick);
        })
        .catch(() => {
          if (!cancelled) {
            setPollTick((current) => completeMessagePoll({
              currentTick: current,
              receivedEventCount: 0,
            }).nextTick);
          }
        });
    }, nextMessagePollDelay({ burstUntilMs: pollBurstUntilMs }));

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [effectiveThreadId, loading, pollBurstUntilMs, pollTick, refreshNewEvents, routeThreadId]);

  const tone = statusTone(thread?.status || 'idle');
  const visibleEvents = useMemo(
    () => events.filter((event) => !!eventCopy(event)),
    [events]
  );
  const currentThreadScrollKey = thread?.id || effectiveThreadId;
  const awaitingReply = thread?.status === 'running';
  streamingRef.current = sending || awaitingReply;

  const syncJumpPill = useCallback(() => {
    const visible = shouldShowJumpToLatest(scrollPolicyRef.current);
    if (visible !== jumpPillVisibleRef.current) {
      jumpPillVisibleRef.current = visible;
      setShowJumpToLatest(visible);
    }
  }, []);

  const handleListScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
    scrollPolicyRef.current = trackChatScroll(scrollPolicyRef.current, {
      distanceFromBottom,
      streaming: streamingRef.current,
    });
    syncJumpPill();
  }, [syncJumpPill]);

  const handleListScrollBeginDrag = useCallback(() => {
    scrollPolicyRef.current = noteUserScrollStart(scrollPolicyRef.current, Date.now());
  }, []);

  const handleJumpToLatest = useCallback(() => {
    scrollPolicyRef.current = jumpToLatest(scrollPolicyRef.current);
    syncJumpPill();
    eventListRef.current?.scrollToEnd({ animated: true });
  }, [syncJumpPill]);

  const sendMessage = useCallback(async () => {
    const text = draft.trim();
    const requestThreadId = effectiveThreadId || routeThreadId;
    if (!requestThreadId || !text || sending) {
      return;
    }

    try {
      setSending(true);
      setPollBurstUntilMs(extendMessagePollBurst());
      const nextThread = await regentApi.sendMessageThreadMessage({ threadId: requestThreadId, text });
      const nextThreadId = adoptMessageThreadId(requestThreadId, nextThread.id);
      setThread(nextThread);
      moveToThread(nextThreadId);
      setDraft('');
      runRegentEventHaptic('messageSent');

      await loadThread(true, nextThreadId);
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
  }, [draft, effectiveThreadId, loadThread, moveToThread, routeThreadId, sending]);

  const resolveApproval = useCallback(async (decision: 'approved' | 'denied') => {
    const approval = thread?.pendingApproval;
    const requestId = approval?.requestId;
    const requestThreadId = effectiveThreadId || routeThreadId;
    if (!requestThreadId || !approval || !requestId || resolvingDecision) {
      return;
    }
    if (isApprovalExpired(approval, Date.now())) {
      return;
    }

    try {
      setResolvingDecision(decision);
      const nextThread = await regentApi.resolveMessageThreadApproval({ threadId: requestThreadId, requestId, decision });
      const nextThreadId = adoptMessageThreadId(requestThreadId, nextThread.id);
      runRegentEventHaptic(decision === 'approved' ? 'approvalGranted' : 'approvalDenied');
      setThread(nextThread);
      moveToThread(nextThreadId);
      setPollBurstUntilMs(extendMessagePollBurst());
      await loadThread(true, nextThreadId);
    } catch (error) {
      setAlertState({
        visible: true,
        title: 'Could not update approval',
        message: error instanceof Error ? error.message : 'Try again in a moment.',
        type: 'error',
      });
    } finally {
      setResolvingDecision(null);
    }
  }, [effectiveThreadId, loadThread, moveToThread, resolvingDecision, routeThreadId, thread]);

  const pendingApproval = thread?.pendingApproval;
  const isPaymentApproval = !!pendingApproval?.amount && !!pendingApproval.currency;
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!pendingApproval || pendingApproval.resolved || !pendingApproval.expiresAt) {
      return;
    }

    setNowMs(Date.now());
    const timer = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [pendingApproval]);

  const approvalExpired = !!pendingApproval && isApprovalExpired(pendingApproval, nowMs);

  useEffect(() => {
    const threadChanged = previousThreadScrollKeyRef.current !== currentThreadScrollKey;
    if (threadChanged) {
      previousThreadScrollKeyRef.current = currentThreadScrollKey;
      previousEventCountRef.current = 0;
      scrollPolicyRef.current = createChatScrollState();
      syncJumpPill();
    }

    if (visibleEvents.length === 0) {
      previousEventCountRef.current = 0;
      return;
    }

    const previousCount = previousEventCountRef.current;
    previousEventCountRef.current = visibleEvents.length;

    if (threadChanged || visibleEvents.length > previousCount) {
      if (!threadChanged && !shouldAutoScroll(scrollPolicyRef.current, Date.now())) {
        return;
      }

      requestAnimationFrame(() => {
        eventListRef.current?.scrollToEnd({ animated: !threadChanged && previousCount > 0 });
      });
    }
  }, [currentThreadScrollKey, syncJumpPill, visibleEvents.length]);

  const renderEvent = useCallback<ListRenderItem<MessageThreadEvent>>(
    ({ item }) => <MessageEventRow event={item} />,
    []
  );

  const handleRefreshNewEventsPress = useCallback(() => {
    refreshNewEvents();
  }, [refreshNewEvents]);

  const listHeader = useMemo(() => {
    if (loading) {
      return <ThreadSkeleton />;
    }

    if (!thread) {
      return (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Message not found</Text>
          <Text style={styles.emptyBody}>Go back and choose another conversation.</Text>
        </View>
      );
    }

    return (
      <View style={styles.listHeader}>
        <View style={styles.sessionCard}>
          <View style={styles.sessionHeader}>
            <View style={styles.sessionTitleGroup}>
              <Text style={styles.sessionTitle}>{thread.title}</Text>
              <Text style={styles.sessionNote}>{thread.latestNote}</Text>
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
            <View style={styles.approvalDetails}>
              <View style={styles.approvalDetailRow}>
                <Text style={styles.approvalDetailLabel}>Action</Text>
                <Text style={styles.approvalDetailValue}>{approvalActionLabel(pendingApproval)}</Text>
              </View>
              <View style={styles.approvalDetailRow}>
                <Text style={styles.approvalDetailLabel}>Requested by</Text>
                <Text style={styles.approvalDetailValue}>{pendingApproval.regentName}</Text>
              </View>
              {approvalAmountLabel(pendingApproval) ? (
                <View style={styles.approvalDetailRow}>
                  <Text style={styles.approvalDetailLabel}>Amount</Text>
                  <Text style={styles.approvalDetailValue}>{approvalAmountLabel(pendingApproval)}</Text>
                </View>
              ) : null}
              {approvalContractLabel(pendingApproval) ? (
                <View style={styles.approvalDetailRow}>
                  <Text style={styles.approvalDetailLabel}>Contract</Text>
                  <Text style={styles.approvalDetailValue}>{approvalContractLabel(pendingApproval)}</Text>
                </View>
              ) : null}
              {approvalExpiryLabel(pendingApproval, nowMs) ? (
                <View style={styles.approvalDetailRow}>
                  <Text style={styles.approvalDetailLabel}>Expires</Text>
                  <Text style={[styles.approvalDetailValue, approvalExpired && styles.approvalDetailValueExpired]}>
                    {approvalExpiryLabel(pendingApproval, nowMs)}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.approvalBody}>{pendingApproval.riskCopy}</Text>
            {approvalExpired ? (
              <Text style={styles.approvalExpiredNote}>
                This request expired before a decision was made, so it can no longer be approved. Nothing was sent. Ask {pendingApproval.regentName} for a new request if this is still needed.
              </Text>
            ) : (
              <View style={styles.approvalActions}>
                <RegentPressable
                  style={styles.secondaryButton}
                  disabled={!!resolvingDecision}
                  onPress={() => resolveApproval('denied')}
                >
                  <Text style={styles.secondaryButtonText}>
                    {resolvingDecision === 'denied' ? 'Denying...' : 'Deny'}
                  </Text>
                </RegentPressable>
                <RegentPressable
                  style={styles.primaryButton}
                  disabled={!!resolvingDecision}
                  onPress={() => resolveApproval('approved')}
                >
                  <Text style={styles.primaryButtonText}>
                    {resolvingDecision === 'approved' ? 'Approving...' : isPaymentApproval ? 'Approve payment' : 'Approve'}
                  </Text>
                </RegentPressable>
              </View>
            )}
          </View>
        ) : null}
      </View>
    );
  }, [
    approvalExpired,
    isPaymentApproval,
    loading,
    nowMs,
    pendingApproval,
    resolveApproval,
    resolvingDecision,
    thread,
    tone.accent,
    tone.label,
    tone.wash,
  ]);

  const listEmpty = useMemo(() => {
    if (loading || !thread) {
      return null;
    }

    return (
      <View style={styles.emptyEventState}>
        <Text style={styles.emptyTitle}>No messages yet</Text>
        <Text style={styles.emptyBody}>Send a note to start the conversation.</Text>
      </View>
    );
  }, [loading, thread]);

  const listFooter = useMemo(() => {
    if (loading || !thread) {
      return null;
    }

    return (
      <>
        {awaitingReply ? (
          <View style={styles.typingRow}>
            <TypingIndicator />
          </View>
        ) : null}
        <View style={styles.refreshFooter}>
          <RegentPressable
            style={styles.refreshSmallButton}
            onPress={handleRefreshNewEventsPress}
          >
            <Text style={styles.refreshSmallText}>Check for new messages</Text>
          </RegentPressable>
        </View>
      </>
    );
  }, [awaitingReply, handleRefreshNewEventsPress, loading, thread]);

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
            <Text style={styles.headerEyebrow}>Message</Text>
            <Text style={styles.headerTitle} numberOfLines={1}>{thread?.agentName || 'Agent'}</Text>
          </View>
          <RegentPressable
            pressStyle="icon"
            onPress={() => loadThread(true)}
            disabled={refreshing}
            style={styles.iconButton}
          >
            <SpinningRefreshIcon refreshing={refreshing} size={18} color={BLUE} />
          </RegentPressable>
        </View>

        <View style={styles.listWrap}>
          <FlatList
            ref={eventListRef}
            style={styles.scroller}
            data={loading || !thread ? [] : visibleEvents}
            renderItem={renderEvent}
            keyExtractor={keyEvent}
            ItemSeparatorComponent={EventSeparator}
            ListHeaderComponent={listHeader}
            ListEmptyComponent={listEmpty}
            ListFooterComponent={listFooter}
            contentContainerStyle={styles.content}
            contentInsetAdjustmentBehavior="automatic"
            keyboardShouldPersistTaps="handled"
            onScroll={handleListScroll}
            onScrollBeginDrag={handleListScrollBeginDrag}
            scrollEventThrottle={32}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                tintColor={BLUE}
                onRefresh={() => loadThread(true)}
              />
            }
          />
          {showJumpToLatest ? (
            <JumpToLatestButton onPress={handleJumpToLatest} style={styles.jumpToLatest} />
          ) : null}
        </View>

        {thread ? (
          <View style={styles.composer}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={thread.composerPlaceholder || 'Message this agent...'}
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
  listWrap: {
    flex: 1,
  },
  scroller: {
    flex: 1,
  },
  jumpToLatest: {
    position: 'absolute',
    right: 20,
    bottom: 14,
  },
  typingRow: {
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingTop: 12,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 18,
  },
  listHeader: {
    gap: 14,
    marginBottom: 14,
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
  approvalDetails: {
    backgroundColor: WHITE,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  approvalDetailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  approvalDetailLabel: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: FONTS.body,
  },
  approvalDetailValue: {
    flex: 1,
    color: TEXT_PRIMARY,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'right',
    fontFamily: FONTS.body,
  },
  approvalDetailValueExpired: {
    color: DANGER,
  },
  approvalBody: {
    color: TEXT_PRIMARY,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONTS.body,
  },
  approvalExpiredNote: {
    color: DANGER,
    fontSize: 13,
    lineHeight: 19,
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
  eventSeparator: {
    height: 10,
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
  refreshFooter: {
    alignItems: 'center',
    marginTop: 14,
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
