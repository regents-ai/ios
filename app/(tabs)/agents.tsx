import { CoinbaseAlert } from '@/components/ui/CoinbaseAlerts';
import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import { PreviewAgentSummary } from '@/types/agentPreviews';
import { formatCurrencyAmount, formatRelativeTime, formatWalletAddress } from '@/utils/agent-surfaces/formatters';
import { fetchPreviewAgents } from '@/utils/fetchPreviewAgents';
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
} = COLORS;

const AMBER = '#A3703A';
const AMBER_WASH = '#F2E7DA';
const GREEN_WASH = '#E6F0EA';
const RED_WASH = '#F3E1DD';

function regentPriority(agent: PreviewAgentSummary) {
  if (agent.runtimeStatus === 'offline') return 0;
  if (agent.status === 'attention') return 1;
  if (agent.runtimeStatus === 'waiting') return 2;
  if (agent.status === 'paused') return 3;
  return 4;
}

function regentTone(agent: PreviewAgentSummary) {
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

export default function AgentsTab() {
  const router = useRouter();
  const [agents, setAgents] = useState<PreviewAgentSummary[]>([]);
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

      const nextAgents = await fetchPreviewAgents();
      setAgents(nextAgents);
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

          {leadRegent ? (
            <Pressable
              onPress={() => router.push({ pathname: '/agent/[id]' as any, params: { id: leadRegent.id } })}
              style={({ pressed }) => [styles.focusCard, pressed && styles.cardPressed]}
            >
              <View style={styles.focusHeader}>
                <View style={styles.focusCopy}>
                  <Text style={styles.focusEyebrow}>Start here</Text>
                  <Text style={styles.focusTitle}>{leadRegent.name}</Text>
                  <Text style={styles.focusBody}>{regentTone(leadRegent).summary}</Text>
                </View>
                <View style={[styles.statusPill, { backgroundColor: regentTone(leadRegent).wash }]}>
                  <Text style={[styles.statusPillText, { color: regentTone(leadRegent).accent }]}>
                    {regentTone(leadRegent).label}
                  </Text>
                </View>
              </View>

              <View style={styles.focusMetaRow}>
                <View style={styles.focusMetaTile}>
                  <Text style={styles.metaLabel}>Balance</Text>
                  <Text style={styles.metaValue}>
                    {leadRegent.stablecoinSymbol} {formatCurrencyAmount(leadRegent.stablecoinBalance)}
                  </Text>
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
                      onPress={() => router.push({ pathname: '/agent/[id]' as any, params: { id: agent.id } })}
                      style={({ pressed }) => [styles.regentRow, pressed && styles.cardPressed]}
                    >
                      <View style={styles.regentRowTop}>
                        <View style={styles.regentRowCopy}>
                          <Text style={styles.regentName}>{agent.name}</Text>
                          <Text style={styles.regentSummary}>{tone.summary}</Text>
                        </View>
                        <View style={[styles.statusPill, { backgroundColor: tone.wash }]}>
                          <Text style={[styles.statusPillText, { color: tone.accent }]}>{tone.label}</Text>
                        </View>
                      </View>

                      <View style={styles.regentRowBottom}>
                        <Text style={styles.regentMeta}>{formatWalletAddress(agent.walletAddress)}</Text>
                        <Text style={styles.regentMeta}>
                          {agent.stablecoinSymbol} {formatCurrencyAmount(agent.stablecoinBalance)}
                        </Text>
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
  statusPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  statusPillText: {
    fontSize: 12,
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
