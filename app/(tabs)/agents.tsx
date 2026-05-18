import { StatusPill } from '@/components/agent-surfaces/StatusPill';
import { LiveValueFlash } from '@/components/motion/LiveValueFlash';
import { CoinbaseAlert } from '@/components/ui/CoinbaseAlerts';
import { RegentPressable } from '@/components/ui/RegentPressable';
import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import { RegentStakingState, RegentSummary } from '@/types/regents';
import { formatCurrencyAmount, formatRelativeTime, formatWalletAddress } from '@/utils/agent-surfaces/formatters';
import { routes } from '@/utils/navigation/routes';
import { hasPositiveRawAmount } from '@/utils/onchain/stakingWalletAction';
import { regentApi } from '@/utils/regentApi/client';
import { useCurrentUser } from '@coinbase/cdp-hooks';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
  onPress?: () => void;
  disabled?: boolean;
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
      summary: agent.treasuryNote || 'This agent has gone quiet and needs a closer look.',
    };
  }

  if (agent.status === 'attention') {
    return {
      label: 'Approval',
      accent: AMBER,
      wash: AMBER_WASH,
      summary: agent.treasuryNote || 'A decision is waiting before this agent can keep moving.',
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
    summary: agent.treasuryNote || 'This agent is moving without needing much from you right now.',
  };
}

function shouldShowRegentDot(agent: RegentSummary) {
  return agent.runtimeStatus === 'online' && agent.status === 'active';
}

function workingBalanceCopy(agent: RegentSummary) {
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

function smartWalletAddress(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed && /^0x[a-fA-F0-9]{40}$/.test(trimmed) ? trimmed : null;
}

function stakingCommandBody(staking: RegentStakingState) {
  return `${staking.wallet_claimable_usdc || '0'} USDC ready. ${staking.wallet_stake_balance || '0'} REGENT staked.`;
}

export default function AgentsTab() {
  const router = useRouter();
  const { currentUser } = useCurrentUser();
  const smartAccount = smartWalletAddress(currentUser?.evmSmartAccounts?.[0] as string | undefined);
  const [agents, setAgents] = useState<RegentSummary[]>([]);
  const [staking, setStaking] = useState<RegentStakingState | null>(null);
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

      const [nextAgents, nextStaking] = await Promise.all([
        regentApi.listRegents(),
        smartAccount ? regentApi.getRegentStaking({ walletAddress: smartAccount }).catch(() => null) : Promise.resolve(null),
      ]);
      setAgents(nextAgents);
      setStaking(nextStaking);
    } catch (error) {
      setAlertState({
        visible: true,
        title: 'Could not load agents',
        message: error instanceof Error ? error.message : 'Please try again in a moment.',
        type: 'error',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [smartAccount]);

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
    const stakingItems: CommandCenterItem[] = staking && (
      hasPositiveRawAmount(staking.wallet_claimable_usdc_raw) ||
      hasPositiveRawAmount(staking.wallet_claimable_regent_raw) ||
      hasPositiveRawAmount(staking.wallet_stake_balance_raw)
    )
      ? [{
          id: 'regent-staking',
          rank: 2,
          title: 'Track rewards',
          body: stakingCommandBody(staking),
          meta: staking.paused ? 'Paused' : staking.chain_label,
          icon: 'sparkles-outline',
          accent: SUCCESS,
          onPress: () => router.push(routes.staking()),
        }]
      : [];

    const talkItem: CommandCenterItem = {
      id: 'talk',
      rank: 3,
      title: 'Message agents',
      body: 'Reply to messages, payment requests, and decisions before work continues.',
      meta: 'Message',
      icon: 'chatbubble-ellipses-outline',
      accent: BLUE,
      onPress: () => router.push(routes.terminal()),
    };

    return [
      ...stakingItems,
      talkItem,
      ...agents.flatMap((agent) => {
        const items: CommandCenterItem[] = [];

        if (hasFundingNeed(agent)) {
          items.push({
            id: `${agent.id}-funding`,
            rank: 1,
            title: `${agent.name} needs a working balance`,
            body: `Working balance is ${workingBalanceCopy(agent)}.`,
            meta: 'Fund agent',
            icon: 'wallet-outline',
            accent: DANGER,
            onPress: () => router.push(routes.agent(agent.id)),
          });
        }

        items.push({
          id: `${agent.id}-runway`,
          rank: 4,
          title: `${agent.name} runway`,
          body: `Working balance is ${workingBalanceCopy(agent)}.`,
          meta: formatWalletAddress(agent.walletAddress),
          icon: 'speedometer-outline',
          accent: creditValue(agent) <= 10 ? ORANGE : SUCCESS,
          onPress: () => router.push(routes.agent(agent.id)),
        });

        return items;
      }),
    ]
      .sort((left, right) => left.rank - right.rank || left.title.localeCompare(right.title))
      .slice(0, 8);
  }, [agents, router, staking]);

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
            <Text style={styles.eyebrow}>Agents</Text>
            <Text style={styles.heroTitle}>Fund an AI agent in seconds</Text>
            <Text style={styles.heroBody}>
              Add USDC, send it to an agent working balance, approve what it spends, and track every result.
            </Text>

            <View style={styles.heroActions}>
              <RegentPressable
                onPress={() => router.push(leadRegent ? routes.agent(leadRegent.id) : routes.wallet())}
                style={styles.primaryButton}
              >
                <Text style={styles.primaryButtonText}>Fund Agent</Text>
              </RegentPressable>
              <RegentPressable
                onPress={() => router.push(routes.wallet())}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>Add USDC</Text>
              </RegentPressable>
              <RegentPressable
                onPress={() => router.push(routes.terminal())}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>Message Agent</Text>
              </RegentPressable>
              <RegentPressable
                onPress={() => router.push(routes.staking())}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>Track Rewards</Text>
              </RegentPressable>
            </View>
          </View>

          <View style={styles.summaryRow}>
            <View style={styles.summaryTile}>
              <LiveValueFlash value={`needs-${summary.needsYou}`} style={styles.summaryValueFlash}>
                <Text style={styles.summaryValue}>{summary.needsYou}</Text>
              </LiveValueFlash>
              <Text style={styles.summaryLabel}>Need you</Text>
            </View>
            <View style={styles.summaryTile}>
              <LiveValueFlash value={`waiting-${summary.waiting}`} style={styles.summaryValueFlash}>
                <Text style={styles.summaryValue}>{summary.waiting}</Text>
              </LiveValueFlash>
              <Text style={styles.summaryLabel}>Waiting</Text>
            </View>
            <View style={styles.summaryTile}>
              <LiveValueFlash value={`steady-${summary.steady}`} style={styles.summaryValueFlash}>
                <Text style={styles.summaryValue}>{summary.steady}</Text>
              </LiveValueFlash>
              <Text style={styles.summaryLabel}>Steady</Text>
            </View>
          </View>

          {commandCenterItems.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Command center</Text>
              <View style={styles.commandList}>
                {commandCenterItems.map((item) => (
                  <RegentPressable
                    key={item.id}
                    onPress={item.onPress}
                    disabled={item.disabled || !item.onPress}
                    accessibilityState={{ disabled: item.disabled || !item.onPress }}
                    pressStyle="card"
                    style={[styles.commandRow, item.disabled && styles.commandRowDisabled]}
                  >
                    <View style={[styles.commandIcon, { backgroundColor: `${item.accent}1A` }]}>
                      <Ionicons name={item.icon} size={18} color={item.accent} />
                    </View>
                    <View style={styles.commandCopy}>
                      <Text style={styles.commandTitle}>{item.title}</Text>
                      <Text style={styles.commandBody} numberOfLines={2}>{item.body}</Text>
                      <Text style={styles.commandMeta}>{item.meta}</Text>
                    </View>
                    {item.disabled ? (
                      <Text style={styles.commandStatus}>Soon</Text>
                    ) : (
                      <Ionicons name="chevron-forward" size={18} color={TEXT_SECONDARY} />
                    )}
                  </RegentPressable>
                ))}
              </View>
            </View>
          ) : null}

          {leadRegent ? (
            <RegentPressable
              onPress={() => router.push(routes.agent(leadRegent.id))}
              pressStyle="card"
              style={styles.focusCard}
            >
              <View style={styles.focusHeader}>
                <View style={styles.focusCopy}>
                  <Text style={styles.focusEyebrow}>Start here</Text>
                  <Text style={styles.focusTitle}>{leadRegent.name}</Text>
                  <Text style={styles.focusBody} numberOfLines={3}>{regentTone(leadRegent).summary}</Text>
                </View>
                <StatusPill
                  label={regentTone(leadRegent).label}
                  color={regentTone(leadRegent).accent}
                  backgroundColor={regentTone(leadRegent).wash}
                  showDot={shouldShowRegentDot(leadRegent)}
                />
              </View>

              <View style={styles.focusMetaRow}>
                <View style={styles.focusMetaTile}>
                  <Text style={styles.metaLabel}>Working balance</Text>
                  <LiveValueFlash value={`lead-credit-${workingBalanceCopy(leadRegent)}`}>
                    <Text style={styles.metaValue}>{workingBalanceCopy(leadRegent)}</Text>
                  </LiveValueFlash>
                </View>
                <View style={styles.focusMetaTile}>
                  <Text style={styles.metaLabel}>Last update</Text>
                  <LiveValueFlash value={`lead-active-${formatRelativeTime(leadRegent.lastActiveAt)}`}>
                    <Text style={styles.metaValue}>{formatRelativeTime(leadRegent.lastActiveAt)}</Text>
                  </LiveValueFlash>
                </View>
              </View>

              <View style={styles.focusFooter}>
                <Text style={styles.footerLink}>Open Agent</Text>
                <Ionicons name="arrow-forward" size={18} color={BLUE} />
              </View>
            </RegentPressable>
          ) : (
            <View style={styles.emptyCard}>
              <Ionicons name="sparkles-outline" size={28} color={BLUE} />
              <Text style={styles.emptyTitle}>No agents yet</Text>
              <Text style={styles.emptyText}>Your agents will show up here when they are ready to fund, pay, and track.</Text>
            </View>
          )}

          {supportingRegents.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>All Agents</Text>
              <View style={styles.regentList}>
                {supportingRegents.map((agent) => {
                  const tone = regentTone(agent);

                  return (
                    <RegentPressable
                      key={agent.id}
                      onPress={() => router.push(routes.agent(agent.id))}
                      pressStyle="card"
                      style={styles.regentRow}
                    >
                      <View style={styles.regentRowTop}>
                        <View style={styles.regentRowCopy}>
                          <Text style={styles.regentName}>{agent.name}</Text>
                          <Text style={styles.regentSummary} numberOfLines={2}>{tone.summary}</Text>
                        </View>
                        <StatusPill label={tone.label} color={tone.accent} backgroundColor={tone.wash} showDot={shouldShowRegentDot(agent)} />
                      </View>

                      <View style={styles.regentRowBottom}>
                        <Text style={styles.regentMeta}>{formatWalletAddress(agent.walletAddress)}</Text>
                        <LiveValueFlash value={`${agent.id}-credit-${workingBalanceCopy(agent)}`} style={styles.regentMetaFlash}>
                          <Text style={styles.regentMeta}>Balance {workingBalanceCopy(agent)}</Text>
                        </LiveValueFlash>
                      </View>
                    </RegentPressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Keep moving</Text>
            <View style={styles.quickGrid}>
              <RegentPressable
                pressStyle="card"
                style={styles.quickCard}
                onPress={() => router.push(routes.terminal())}
              >
                <Ionicons name="chatbubble-ellipses-outline" size={18} color={BLUE} />
                <Text style={styles.quickTitle}>Message</Text>
                <Text style={styles.quickBody} numberOfLines={2}>Messages, payment requests, and approvals stay together.</Text>
                <Text style={styles.quickMeta}>Message</Text>
              </RegentPressable>

              <RegentPressable
                onPress={() => router.push('/wallet')}
                pressStyle="card"
                style={styles.quickCard}
              >
                <Ionicons name="wallet-outline" size={18} color={BLUE} />
                <Text style={styles.quickTitle}>Fund</Text>
                <Text style={styles.quickBody} numberOfLines={2}>Add USDC for agent work or move money back when work is done.</Text>
              </RegentPressable>

              <RegentPressable
                onPress={() => router.push('/autolaunch')}
                pressStyle="card"
                style={styles.quickCard}
              >
                <Ionicons name="trending-up-outline" size={18} color={BLUE} />
                <Text style={styles.quickTitle}>Buy</Text>
                <Text style={styles.quickBody} numberOfLines={2}>Open Autolaunch when a story is ready for outside support.</Text>
              </RegentPressable>
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
    lineHeight: 26,
    fontFamily: FONTS.heading,
  },
  summaryValueFlash: {
    alignSelf: 'flex-start',
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
    flexWrap: 'wrap',
    gap: 12,
  },
  focusCopy: {
    flex: 1,
    minWidth: 0,
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
    flexWrap: 'wrap',
    gap: 10,
  },
  focusMetaTile: {
    flex: 1,
    minWidth: 130,
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
  commandRowDisabled: {
    backgroundColor: BLUE_WASH,
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
    minWidth: 0,
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
  commandStatus: {
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
    flexWrap: 'wrap',
    gap: 12,
  },
  regentRowCopy: {
    flex: 1,
    minWidth: 0,
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
    flexWrap: 'wrap',
    gap: 12,
  },
  regentMeta: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: FONTS.body,
  },
  regentMetaFlash: {
    alignSelf: 'flex-start',
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
  quickMeta: {
    color: BLUE,
    fontSize: 12,
    fontFamily: FONTS.body,
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
