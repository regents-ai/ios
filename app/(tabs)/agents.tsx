import { StatusPill } from '@/components/agent-surfaces/StatusPill';
import { CoinbaseAlert } from '@/components/ui/CoinbaseAlerts';
import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import { BaseRegentSnapshot, RegentSummary } from '@/types/regents';
import { TerminalSessionSummary } from '@/types/terminal';
import { formatCurrencyAmount, formatRelativeTime, formatWalletAddress } from '@/utils/agent-surfaces/formatters';
import { routes } from '@/utils/navigation/routes';
import { regentApi } from '@/utils/regentApi/client';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
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

const AMBER = '#A3703A';
const AMBER_WASH = '#F2E7DA';
const GREEN_WASH = '#E6F0EA';
const RED_WASH = '#F3E1DD';

type CommandCenterItem = {
  id: string;
  rank: number;
  title: string;
  body: string;
  meta: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
  onPress: () => void;
};

function regentPriority(agent: RegentSummary) {
  if (agent.runtimeStatus === 'offline') return 0;
  if (agent.status === 'attention') return 1;
  if (agent.runtimeStatus === 'waiting') return 2;
  if (agent.status === 'paused') return 3;
  return 4;
}

function regentTone(agent: RegentSummary) {
  if (agent.runtimeStatus === 'offline') {
    return {
      label: 'Needs you',
      accent: DANGER,
      wash: RED_WASH,
      summary: agent.treasuryNote || 'This Regent has gone quiet and needs a closer look.',
    };
  }

  if (agent.status === 'attention') {
    return {
      label: 'Review',
      accent: AMBER,
      wash: AMBER_WASH,
      summary: agent.treasuryNote || 'A decision is waiting before this Regent can keep moving.',
    };
  }

  if (agent.runtimeStatus === 'waiting') {
    return {
      label: 'Waiting',
      accent: AMBER,
      wash: AMBER_WASH,
      summary: agent.treasuryNote || 'The next handoff is clear, but it still needs your nudge.',
    };
  }

  return {
    label: 'Steady',
    accent: SUCCESS,
    wash: GREEN_WASH,
    summary: agent.treasuryNote || 'This Regent is moving without needing much from you right now.',
  };
}

function accountCreditCopy(agent: RegentSummary) {
  return agent.platformState.prepaidBalanceUsd
    ? `$${formatCurrencyAmount(agent.platformState.prepaidBalanceUsd)}`
    : 'Not listed';
}

function creditValue(agent: RegentSummary) {
  return Number.parseFloat(agent.platformState.prepaidBalanceUsd || '0');
}

function hasFundingNeed(agent: RegentSummary) {
  return ['zero', 'failed', 'paused'].includes(agent.platformState.billingStatus) || creditValue(agent) <= 10;
}

function snapshotMoneyValue(value: string) {
  return Number.parseFloat(value || '0');
}

export default function AgentsTab() {
  const router = useRouter();
  const [agents, setAgents] = useState<RegentSummary[]>([]);
  const [terminalSessions, setTerminalSessions] = useState<TerminalSessionSummary[]>([]);
  const [baseSnapshots, setBaseSnapshots] = useState<Record<string, BaseRegentSnapshot>>({});
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

  const loadAgents = useCallback(async (refresh = false) => {
    try {
      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const nextAgents = await regentApi.listRegents();
      const [nextSessions, nextSnapshots] = await Promise.all([
        regentApi.listTerminalSessions(),
        Promise.all(nextAgents.map(async (agent) => [agent.id, await regentApi.getBaseSnapshot(agent.id)] as const)),
      ]);
      setAgents(nextAgents);
      setTerminalSessions(nextSessions);
      setBaseSnapshots(Object.fromEntries(nextSnapshots));
    } catch (error) {
      setAlertState({
        visible: true,
        title: 'Could not load Regents',
        message: error instanceof Error ? error.message : 'Please try again in a moment.',
        type: 'error',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadAgents();
    }, [loadAgents])
  );

  const sortedAgents = useMemo(
    () =>
      [...agents].sort((left, right) => {
        const priorityDiff = regentPriority(left) - regentPriority(right);
        if (priorityDiff !== 0) {
          return priorityDiff;
        }

        return new Date(right.lastActiveAt).getTime() - new Date(left.lastActiveAt).getTime();
      }),
    [agents]
  );

  const leadRegent = sortedAgents[0] ?? null;
  const supportingRegents = sortedAgents.slice(1);

  const commandCenterItems = useMemo<CommandCenterItem[]>(() => {
    const latestSessionByRegent = new Map<string, TerminalSessionSummary>();
    for (const session of terminalSessions) {
      const current = latestSessionByRegent.get(session.agentId);
      if (!current || new Date(session.lastUpdatedAt).getTime() > new Date(current.lastUpdatedAt).getTime()) {
        latestSessionByRegent.set(session.agentId, session);
      }
    }

    return agents
      .flatMap((agent) => {
        const latestSession = latestSessionByRegent.get(agent.id);
        const snapshot = baseSnapshots[agent.id];
        const items: CommandCenterItem[] = [];

        if (latestSession?.pendingApproval) {
          items.push({
            id: `${agent.id}-review`,
            rank: 0,
            title: `${agent.name} needs a decision`,
            body: latestSession.pendingApproval.riskCopy,
            meta: formatRelativeTime(latestSession.lastUpdatedAt),
            icon: 'eye-outline',
            accent: ORANGE,
            onPress: () => router.push(routes.terminalSession(latestSession.id)),
          });
        }

        if (hasFundingNeed(agent)) {
          items.push({
            id: `${agent.id}-funding`,
            rank: 1,
            title: `${agent.name} needs more runway`,
            body: `Account credit is ${accountCreditCopy(agent)}.`,
            meta: agent.platformState.billingStatus,
            icon: 'wallet-outline',
            accent: DANGER,
            onPress: () => router.push(routes.agent(agent.id)),
          });
        }

        if (latestSession) {
          items.push({
            id: `${agent.id}-terminal`,
            rank: 2,
            title: `${agent.name} latest Talk`,
            body: latestSession.latestNote,
            meta: formatRelativeTime(latestSession.lastUpdatedAt),
            icon: 'chatbubble-ellipses-outline',
            accent: BLUE,
            onPress: () => router.push(routes.terminalSession(latestSession.id)),
          });
        }

        if (snapshot && (snapshotMoneyValue(snapshot.claimableUsdc) > 0 || snapshotMoneyValue(snapshot.stakedRegent) > 0)) {
          items.push({
            id: `${agent.id}-base`,
            rank: 3,
            title: `${agent.name} Base records`,
            body: `${snapshot.claimableUsdc} USDC claimable. ${snapshot.stakedRegent} REGENT staked.`,
            meta: snapshot.stale ? 'Needs refresh' : 'Current',
            icon: 'layers-outline',
            accent: SUCCESS,
            onPress: () => router.push(routes.agent(agent.id)),
          });
        }

        items.push({
          id: `${agent.id}-runway`,
          rank: 4,
          title: `${agent.name} wallet runway`,
          body: `Account credit is ${accountCreditCopy(agent)}.`,
          meta: formatWalletAddress(agent.walletAddress),
          icon: 'speedometer-outline',
          accent: creditValue(agent) <= 10 ? ORANGE : SUCCESS,
          onPress: () => router.push(routes.agent(agent.id)),
        });

        return items;
      })
      .sort((left, right) => left.rank - right.rank || left.title.localeCompare(right.title))
      .slice(0, 8);
  }, [agents, baseSnapshots, router, terminalSessions]);

  const summary = useMemo(() => {
    const needsYou = agents.filter((agent) => agent.runtimeStatus === 'offline' || agent.status === 'attention').length;
    const waiting = agents.filter((agent) => agent.runtimeStatus === 'waiting').length;
    const steady = agents.filter((agent) => agent.runtimeStatus === 'online' && agent.status === 'active').length;
    return { needsYou, waiting, steady };
  }, [agents]);

  return (
    <View style={styles.container}>
      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={BLUE} />
          <Text style={styles.loadingText}>Loading Regents…</Text>
        </View>
      ) : (
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadAgents(true)} tintColor={BLUE} />}
        >
          <View style={styles.heroCard}>
            <Text style={styles.eyebrow}>Regents</Text>
            <Text style={styles.heroTitle}>Run the work from one place</Text>
            <Text style={styles.heroBody}>
              See which Regents are moving, step into the one that needs you next, and keep money and
              conversations close by.
            </Text>

            <View style={styles.heroActions}>
              <Pressable
                onPress={() => router.push('/wallet')}
                style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
              >
                <Text style={styles.primaryButtonText}>Open Wallet</Text>
              </Pressable>
              <Pressable
                onPress={() => router.push('/terminal')}
                style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
              >
                <Text style={styles.secondaryButtonText}>Open Talk</Text>
              </Pressable>
              <Pressable
                onPress={() => router.push('/autolaunch')}
                style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
              >
                <Text style={styles.secondaryButtonText}>Open Buy</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.summaryRow}>
            <View style={styles.summaryTile}>
              <Text style={styles.summaryValue}>{summary.needsYou}</Text>
              <Text style={styles.summaryLabel}>Need you</Text>
            </View>
            <View style={styles.summaryTile}>
              <Text style={styles.summaryValue}>{summary.waiting}</Text>
              <Text style={styles.summaryLabel}>Waiting</Text>
            </View>
            <View style={styles.summaryTile}>
              <Text style={styles.summaryValue}>{summary.steady}</Text>
              <Text style={styles.summaryLabel}>Steady</Text>
            </View>
          </View>

          {commandCenterItems.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Command center</Text>
              <View style={styles.commandList}>
                {commandCenterItems.map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={item.onPress}
                    style={({ pressed }) => [styles.commandRow, pressed && styles.cardPressed]}
                  >
                    <View style={[styles.commandIcon, { backgroundColor: `${item.accent}1A` }]}>
                      <Ionicons name={item.icon} size={18} color={item.accent} />
                    </View>
                    <View style={styles.commandCopy}>
                      <Text style={styles.commandTitle}>{item.title}</Text>
                      <Text style={styles.commandBody}>{item.body}</Text>
                      <Text style={styles.commandMeta}>{item.meta}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={TEXT_SECONDARY} />
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {leadRegent ? (
            <Pressable
              onPress={() => router.push(routes.agent(leadRegent.id))}
              style={({ pressed }) => [styles.focusCard, pressed && styles.cardPressed]}
            >
              <View style={styles.focusHeader}>
                <View style={styles.focusCopy}>
                  <Text style={styles.focusEyebrow}>Start here</Text>
                  <Text style={styles.focusTitle}>{leadRegent.name}</Text>
                  <Text style={styles.focusBody}>{regentTone(leadRegent).summary}</Text>
                </View>
                <StatusPill
                  label={regentTone(leadRegent).label}
                  color={regentTone(leadRegent).accent}
                  backgroundColor={regentTone(leadRegent).wash}
                />
              </View>

              <View style={styles.focusMetaRow}>
                <View style={styles.focusMetaTile}>
                  <Text style={styles.metaLabel}>Account credit</Text>
                  <Text style={styles.metaValue}>{accountCreditCopy(leadRegent)}</Text>
                </View>
                <View style={styles.focusMetaTile}>
                  <Text style={styles.metaLabel}>Last update</Text>
                  <Text style={styles.metaValue}>{formatRelativeTime(leadRegent.lastActiveAt)}</Text>
                </View>
              </View>

              <View style={styles.focusFooter}>
                <Text style={styles.footerLink}>Open Regent</Text>
                <Ionicons name="arrow-forward" size={18} color={BLUE} />
              </View>
            </Pressable>
          ) : (
            <View style={styles.emptyCard}>
              <Ionicons name="sparkles-outline" size={28} color={BLUE} />
              <Text style={styles.emptyTitle}>No Regents yet</Text>
              <Text style={styles.emptyText}>Your Regents will show up here once they are ready to follow.</Text>
            </View>
          )}

          {supportingRegents.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>All Regents</Text>
              <View style={styles.regentList}>
                {supportingRegents.map((agent) => {
                  const tone = regentTone(agent);

                  return (
                    <Pressable
                      key={agent.id}
                      onPress={() => router.push(routes.agent(agent.id))}
                      style={({ pressed }) => [styles.regentRow, pressed && styles.cardPressed]}
                    >
                      <View style={styles.regentRowTop}>
                        <View style={styles.regentRowCopy}>
                          <Text style={styles.regentName}>{agent.name}</Text>
                          <Text style={styles.regentSummary}>{tone.summary}</Text>
                        </View>
                        <StatusPill label={tone.label} color={tone.accent} backgroundColor={tone.wash} />
                      </View>

                      <View style={styles.regentRowBottom}>
                        <Text style={styles.regentMeta}>{formatWalletAddress(agent.walletAddress)}</Text>
                        <Text style={styles.regentMeta}>Credit {accountCreditCopy(agent)}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Keep moving</Text>
            <View style={styles.quickGrid}>
              <Pressable
                onPress={() => router.push('/terminal')}
                style={({ pressed }) => [styles.quickCard, pressed && styles.cardPressed]}
              >
                <Ionicons name="chatbubble-ellipses-outline" size={18} color={BLUE} />
                <Text style={styles.quickTitle}>Talk</Text>
                <Text style={styles.quickBody}>Check what Hermes changed most recently.</Text>
              </Pressable>

              <Pressable
                onPress={() => router.push('/wallet')}
                style={({ pressed }) => [styles.quickCard, pressed && styles.cardPressed]}
              >
                <Ionicons name="wallet-outline" size={18} color={BLUE} />
                <Text style={styles.quickTitle}>Wallet</Text>
                <Text style={styles.quickBody}>Fund a Regent or move money back when the work is done.</Text>
              </Pressable>

              <Pressable
                onPress={() => router.push('/autolaunch')}
                style={({ pressed }) => [styles.quickCard, pressed && styles.cardPressed]}
              >
                <Ionicons name="trending-up-outline" size={18} color={BLUE} />
                <Text style={styles.quickTitle}>Buy</Text>
                <Text style={styles.quickBody}>Open Autolaunch when a story is ready for outside support.</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
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
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 120,
    gap: 16,
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
  heroCard: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 28,
    padding: 22,
    gap: 14,
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
    fontSize: 32,
    lineHeight: 38,
    fontFamily: FONTS.heading,
  },
  heroBody: {
    color: TEXT_SECONDARY,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: FONTS.body,
  },
  heroActions: {
    flexDirection: 'column',
    gap: 10,
    alignItems: 'stretch',
  },
  primaryButton: {
    backgroundColor: BLUE,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 13,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  primaryButtonPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
  primaryButtonText: {
    color: WHITE,
    fontSize: 14,
    fontFamily: FONTS.body,
  },
  secondaryButton: {
    backgroundColor: WHITE,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  secondaryButtonPressed: {
    opacity: 0.95,
  },
  secondaryButtonText: {
    color: TEXT_PRIMARY,
    fontSize: 14,
    fontFamily: FONTS.body,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  summaryTile: {
    flex: 1,
    minWidth: 96,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 12,
    gap: 4,
  },
  summaryValue: {
    color: BLUE,
    fontSize: 22,
    fontFamily: FONTS.heading,
  },
  summaryLabel: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    fontFamily: FONTS.body,
  },
  focusCard: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 24,
    padding: 20,
    gap: 14,
  },
  focusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  focusCopy: {
    flex: 1,
    gap: 4,
  },
  focusEyebrow: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    textTransform: 'uppercase',
    fontFamily: FONTS.body,
  },
  focusTitle: {
    color: TEXT_PRIMARY,
    fontSize: 26,
    fontFamily: FONTS.heading,
  },
  focusBody: {
    color: TEXT_PRIMARY,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONTS.body,
  },
  focusMetaRow: {
    flexDirection: 'row',
    gap: 10,
  },
  focusMetaTile: {
    flex: 1,
    backgroundColor: WHITE,
    borderRadius: 18,
    padding: 14,
    gap: 5,
  },
  metaLabel: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    fontFamily: FONTS.body,
  },
  metaValue: {
    color: TEXT_PRIMARY,
    fontSize: 16,
    lineHeight: 22,
    fontFamily: FONTS.heading,
  },
  focusFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: BLUE_WASH,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  footerLink: {
    color: BLUE,
    fontSize: 15,
    fontFamily: FONTS.heading,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    color: TEXT_PRIMARY,
    fontSize: 22,
    fontFamily: FONTS.heading,
  },
  commandList: {
    gap: 10,
  },
  commandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: CARD_ALT,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 20,
    padding: 14,
  },
  commandIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commandCopy: {
    flex: 1,
    gap: 3,
  },
  commandTitle: {
    color: TEXT_PRIMARY,
    fontSize: 16,
    lineHeight: 20,
    fontFamily: FONTS.heading,
  },
  commandBody: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FONTS.body,
  },
  commandMeta: {
    color: BLUE,
    fontSize: 12,
    fontFamily: FONTS.body,
  },
  regentList: {
    gap: 10,
  },
  regentRow: {
    backgroundColor: CARD_ALT,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 20,
    padding: 16,
    gap: 10,
  },
  regentRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  regentRowCopy: {
    flex: 1,
    gap: 4,
  },
  regentName: {
    color: TEXT_PRIMARY,
    fontSize: 18,
    fontFamily: FONTS.heading,
  },
  regentSummary: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: FONTS.body,
  },
  regentRowBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  regentMeta: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    fontFamily: FONTS.body,
  },
  quickGrid: {
    gap: 10,
  },
  quickCard: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 20,
    padding: 16,
    gap: 8,
  },
  quickTitle: {
    color: TEXT_PRIMARY,
    fontSize: 18,
    fontFamily: FONTS.heading,
  },
  quickBody: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: FONTS.body,
  },
  cardPressed: {
    opacity: 0.96,
    transform: [{ scale: 0.985 }],
  },
  emptyCard: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    gap: 12,
  },
  emptyTitle: {
    color: TEXT_PRIMARY,
    fontSize: 24,
    fontFamily: FONTS.heading,
  },
  emptyText: {
    color: TEXT_SECONDARY,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    fontFamily: FONTS.body,
  },
});
