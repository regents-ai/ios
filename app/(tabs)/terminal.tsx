import { StatusPill } from '@/components/agent-surfaces/StatusPill';
import { SpinningRefreshIcon } from '@/components/motion/SpinningRefreshIcon';
import { ProfileButton } from '@/components/navigation/ProfileButton';
import { CoinbaseAlert } from '@/components/ui/CoinbaseAlerts';
import { RegentPressable } from '@/components/ui/RegentPressable';
import { useRegentsXmtp } from '@/components/xmtp/RegentsXmtpProvider';
import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import { MessageContactSuggestion, MessageThread, TerminalSessionStatus, TerminalSessionSummary } from '@/types/regents';
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
  TextInput,
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

function shortAddress(address: string) {
  return address.length > 12 ? `${address.slice(0, 6)}...${address.slice(-4)}` : address;
}

export default function TerminalTab() {
  const router = useRouter();
  const { connectWalletChannel, environment: secureMessageEnvironment } = useRegentsXmtp();
  const [sessions, setSessions] = useState<TerminalSessionSummary[]>([]);
  const [messageThreads, setMessageThreads] = useState<MessageThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [newMessageInput, setNewMessageInput] = useState('');
  const [recentContacts, setRecentContacts] = useState<MessageContactSuggestion[]>([]);
  const [regentContacts, setRegentContacts] = useState<MessageContactSuggestion[]>([]);
  const [lookupTarget, setLookupTarget] = useState<{ address: string; ensName?: string } | null>(null);
  const [lookupLoading, setLookupLoading] = useState<'recent' | 'regent' | null>(null);
  const [connectingContactId, setConnectingContactId] = useState<string | null>(null);
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

      const [nextSessions, nextThreads] = await Promise.all([
        regentApi.listTerminalSessions(),
        regentApi.listMessageThreads(),
      ]);
      setSessions(nextSessions);
      setMessageThreads(nextThreads);
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
  const secureChannelThreadIds = useMemo(
    () => new Set(
      messageThreads
        .filter((thread) => thread.xmtpLinks.some((link) => link.environment === secureMessageEnvironment))
        .map((thread) => thread.platformThreadId),
    ),
    [messageThreads, secureMessageEnvironment]
  );

  const handleLookupRecentAddresses = useCallback(async () => {
    const addressOrName = newMessageInput.trim();
    if (!addressOrName) {
      setAlertState({
        visible: true,
        title: 'Enter an address',
        message: 'Use an Ethereum address or ENS name.',
        type: 'info',
      });
      return;
    }

    setLookupLoading('recent');
    setLookupTarget(null);
    setRecentContacts([]);
    try {
      const result = await regentApi.lookupRecentMessageContacts({ addressOrName });
      setLookupTarget(result.target.ensName
        ? { address: result.target.address, ensName: result.target.ensName }
        : { address: result.target.address });
      setRecentContacts(result.contacts);
    } catch (error) {
      setAlertState({
        visible: true,
        title: 'Could not look up recent addresses',
        message: error instanceof Error ? error.message : 'Try again in a moment.',
        type: 'error',
      });
    } finally {
      setLookupLoading(null);
    }
  }, [newMessageInput]);

  const handleLookupRegentUsers = useCallback(async () => {
    setLookupLoading('regent');
    try {
      setRegentContacts(await regentApi.listRegentMessageContacts());
    } catch (error) {
      setAlertState({
        visible: true,
        title: 'Could not load Regent users',
        message: error instanceof Error ? error.message : 'Try again in a moment.',
        type: 'error',
      });
    } finally {
      setLookupLoading(null);
    }
  }, []);

  const handleConnectAddress = useCallback(async (input: { id: string; address: string; label: string }) => {
    setConnectingContactId(input.id);
    try {
      await connectWalletChannel({ recipientAddress: input.address });
      setAlertState({
        visible: true,
        title: 'Secure channel connected',
        message: `You can message ${input.label}.`,
        type: 'success',
      });
    } catch (error) {
      setAlertState({
        visible: true,
        title: 'Could not connect',
        message: error instanceof Error ? error.message : 'This address is not ready for secure messages yet.',
        type: 'error',
      });
    } finally {
      setConnectingContactId(null);
    }
  }, [connectWalletChannel]);

  const renderContactRow = useCallback((contact: MessageContactSuggestion) => (
    <View key={contact.id} style={styles.contactRow}>
      <View style={styles.contactIcon}>
        <Ionicons name={contact.kind === 'regent_human' ? 'person-outline' : 'sparkles-outline'} size={18} color={BLUE} />
      </View>
      <View style={styles.contactTextGroup}>
        <Text style={styles.contactLabel} numberOfLines={1}>{contact.label}</Text>
        <Text style={styles.contactAddress} numberOfLines={1}>{contact.ensName || shortAddress(contact.address)}</Text>
        {contact.detail ? <Text style={styles.contactDetail} numberOfLines={1}>{contact.detail}</Text> : null}
      </View>
      <RegentPressable
        pressStyle="button"
        style={styles.connectButton}
        disabled={connectingContactId === contact.id}
        onPress={() => handleConnectAddress({ id: contact.id, address: contact.address, label: contact.label })}
      >
        {connectingContactId === contact.id ? (
          <ActivityIndicator size="small" color={TEXT_PRIMARY} />
        ) : (
          <Text style={styles.connectButtonText}>Connect</Text>
        )}
      </RegentPressable>
    </View>
  ), [connectingContactId, handleConnectAddress]);

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
              Talk with your own agent, approve payment requests, and keep agent conversations together.
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

        <View style={styles.newMessageCard}>
          <View style={styles.newMessageHeader}>
            <View style={styles.newMessageTitleGroup}>
              <Text style={styles.sectionEyebrow}>New message</Text>
              <Text style={styles.sectionTitle}>Find someone to message</Text>
            </View>
            <Ionicons name="create-outline" size={22} color={BLUE} />
          </View>

          <TextInput
            value={newMessageInput}
            onChangeText={(value) => {
              setNewMessageInput(value);
              setLookupTarget(null);
              setRecentContacts([]);
            }}
            placeholder="ENS or Ethereum address"
            placeholderTextColor={TEXT_SECONDARY}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.messageInput}
          />

          <View style={styles.lookupActions}>
            <RegentPressable
              pressStyle="button"
              style={[styles.lookupButton, !newMessageInput.trim() && styles.lookupButtonDisabled]}
              disabled={lookupLoading === 'recent' || !newMessageInput.trim()}
              onPress={handleLookupRecentAddresses}
            >
              {lookupLoading === 'recent' ? (
                <ActivityIndicator size="small" color={TEXT_PRIMARY} />
              ) : (
                <Text style={styles.lookupButtonText}>Lookup Recent Addresses</Text>
              )}
            </RegentPressable>
            <RegentPressable
              pressStyle="button"
              style={styles.secondaryLookupButton}
              disabled={lookupLoading === 'regent'}
              onPress={handleLookupRegentUsers}
            >
              {lookupLoading === 'regent' ? (
                <ActivityIndicator size="small" color={BLUE} />
              ) : (
                <Text style={styles.secondaryLookupButtonText}>Lookup Regent Users</Text>
              )}
            </RegentPressable>
          </View>

          {lookupTarget ? (
            <View style={styles.targetRow}>
              <View style={styles.targetTextGroup}>
                <Text style={styles.targetLabel} numberOfLines={1}>{lookupTarget.ensName || 'Entered address'}</Text>
                <Text style={styles.targetAddress} numberOfLines={1}>{shortAddress(lookupTarget.address)}</Text>
              </View>
              <RegentPressable
                pressStyle="button"
                style={styles.connectButton}
                disabled={connectingContactId === `target:${lookupTarget.address}`}
                onPress={() => handleConnectAddress({
                  id: `target:${lookupTarget.address}`,
                  address: lookupTarget.address,
                  label: lookupTarget.ensName || shortAddress(lookupTarget.address),
                })}
              >
                {connectingContactId === `target:${lookupTarget.address}` ? (
                  <ActivityIndicator size="small" color={TEXT_PRIMARY} />
                ) : (
                  <Text style={styles.connectButtonText}>Connect</Text>
                )}
              </RegentPressable>
            </View>
          ) : null}

          {recentContacts.length > 0 ? (
            <View style={styles.contactSection}>
              <Text style={styles.contactSectionTitle}>Recent ENS addresses</Text>
              {recentContacts.map(renderContactRow)}
            </View>
          ) : lookupTarget ? (
            <Text style={styles.lookupEmpty}>No recent ENS names found for this address.</Text>
          ) : null}

          {regentContacts.length > 0 ? (
            <View style={styles.contactSection}>
              <Text style={styles.contactSectionTitle}>Regent users</Text>
              {regentContacts.map(renderContactRow)}
            </View>
          ) : null}
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
            <Text style={styles.emptyBody}>Agent messages, payment requests, and secure agent chats can appear here when they need you.</Text>
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
                    {secureChannelThreadIds.has(session.id) ? (
                      <View style={styles.secureChip}>
                        <Ionicons name="lock-closed-outline" size={14} color={BLUE} />
                        <Text style={styles.secureText}>Secure channel</Text>
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
  newMessageCard: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 20,
    padding: 16,
    gap: 14,
  },
  newMessageHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  newMessageTitleGroup: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  sectionEyebrow: {
    color: BLUE,
    fontSize: 12,
    textTransform: 'uppercase',
    fontFamily: FONTS.body,
  },
  sectionTitle: {
    color: TEXT_PRIMARY,
    fontSize: 21,
    lineHeight: 25,
    fontFamily: FONTS.heading,
  },
  messageInput: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD_ALT,
    color: TEXT_PRIMARY,
    paddingHorizontal: 14,
    fontSize: 15,
    fontFamily: FONTS.body,
  },
  lookupActions: {
    gap: 10,
  },
  lookupButton: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  lookupButtonDisabled: {
    opacity: 0.55,
  },
  lookupButtonText: {
    color: TEXT_PRIMARY,
    fontSize: 14,
    fontFamily: FONTS.body,
  },
  secondaryLookupButton: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD_ALT,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  secondaryLookupButtonText: {
    color: BLUE,
    fontSize: 14,
    fontFamily: FONTS.body,
  },
  targetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 14,
  },
  targetTextGroup: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  targetLabel: {
    color: TEXT_PRIMARY,
    fontSize: 15,
    fontFamily: FONTS.body,
  },
  targetAddress: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    fontFamily: FONTS.body,
  },
  contactSection: {
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 14,
    gap: 10,
  },
  contactSectionTitle: {
    color: TEXT_PRIMARY,
    fontSize: 14,
    fontFamily: FONTS.body,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  contactIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BLUE_WASH,
  },
  contactTextGroup: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  contactLabel: {
    color: TEXT_PRIMARY,
    fontSize: 15,
    fontFamily: FONTS.body,
  },
  contactAddress: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    fontFamily: FONTS.body,
  },
  contactDetail: {
    color: TEXT_SECONDARY,
    fontSize: 11,
    fontFamily: FONTS.body,
  },
  connectButton: {
    minWidth: 86,
    minHeight: 40,
    borderRadius: 12,
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  connectButtonText: {
    color: TEXT_PRIMARY,
    fontSize: 13,
    fontFamily: FONTS.body,
  },
  lookupEmpty: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    lineHeight: 18,
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
  secureChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    backgroundColor: BLUE_WASH,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  secureText: {
    color: BLUE,
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
