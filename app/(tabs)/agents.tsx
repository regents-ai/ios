import { CoinbaseAlert } from '@/components/ui/CoinbaseAlerts';
import { PreviewNotice } from '@/components/ui/PreviewNotice';
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
  FlatList,
  Pressable,
  RefreshControl,
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

function cardPriority(agent: PreviewAgentSummary) {
  if (agent.runtimeStatus === 'offline') return 0;
  if (agent.status === 'attention') return 1;
  if (agent.runtimeStatus === 'waiting') return 2;
  if (agent.status === 'paused') return 3;
  return 4;
}

function runtimeTone(runtimeStatus: PreviewAgentSummary['runtimeStatus']) {
  switch (runtimeStatus) {
    case 'online':
      return {
        label: 'Online',
        accent: SUCCESS,
        wash: GREEN_WASH,
      };
    case 'waiting':
      return {
        label: 'Waiting',
        accent: AMBER,
        wash: AMBER_WASH,
      };
    case 'offline':
      return {
        label: 'Offline',
        accent: DANGER,
        wash: '#F3E1DD',
      };
  }
}

function attentionCopy(agent: PreviewAgentSummary) {
  if (agent.runtimeStatus === 'offline') {
    return {
      eyebrow: 'Needs attention now',
      summary: 'Sample review card for an agent that needs attention.',
      nextAction: 'Open preview',
      accent: DANGER,
      wash: '#F3E1DD',
    };
  }

  if (agent.status === 'attention') {
    return {
      eyebrow: 'Review recommended',
      summary: agent.treasuryNote || 'Sample update showing how a review card can rise to the top.',
      nextAction: 'Open preview',
      accent: AMBER,
      wash: AMBER_WASH,
    };
  }

  if (agent.runtimeStatus === 'waiting') {
    return {
      eyebrow: 'Next step shown here',
      summary: agent.treasuryNote || 'Sample update showing how a paused handoff or review step could appear later.',
      nextAction: 'Open preview',
      accent: AMBER,
      wash: AMBER_WASH,
    };
  }

  if (agent.status === 'paused') {
    return {
      eyebrow: 'Paused',
      summary: agent.treasuryNote || 'Sample paused state showing how a summary card could look later.',
      nextAction: 'Open preview',
      accent: DANGER,
      wash: '#F3E1DD',
    };
  }

  return {
    eyebrow: 'Steady',
    summary: agent.treasuryNote || 'Sample steady-state card showing the shape of the future mobile agent view.',
    nextAction: 'Open preview',
    accent: SUCCESS,
    wash: GREEN_WASH,
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
        title: 'Unable to load preview cards',
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
      loadAgents();
    }, [loadAgents])
  );

  const sortedAgents = useMemo(
    () =>
      [...agents].sort((left, right) => {
        const priorityDiff = cardPriority(left) - cardPriority(right);
        if (priorityDiff !== 0) {
          return priorityDiff;
        }

        return new Date(right.lastActiveAt).getTime() - new Date(left.lastActiveAt).getTime();
      }),
    [agents]
  );

  const summary = useMemo(() => {
    const attentionCount = agents.filter((agent) => agent.runtimeStatus === 'offline' || agent.status === 'attention').length;
    const waitingCount = agents.filter((agent) => agent.runtimeStatus === 'waiting').length;
    const steadyCount = agents.filter((agent) => agent.runtimeStatus === 'online' && agent.status === 'active').length;

    return { attentionCount, waitingCount, steadyCount };
  }, [agents]);

  const renderItem = ({ item }: { item: AgentSummary }) => {
    const runtime = runtimeTone(item.runtimeStatus);
    const attention = attentionCopy(item);

    return (
      <Pressable
        onPress={() => router.push({ pathname: '/agent/[id]' as any, params: { id: item.id } })}
        style={({ pressed }) => [
          styles.agentCard,
          { borderColor: attention.accent },
          pressed && styles.cardPressed,
        ]}
      >
        <View style={styles.cardHeader}>
          <View style={[styles.priorityPill, { backgroundColor: attention.wash }]}>
            <Text style={[styles.priorityPillText, { color: attention.accent }]}>{attention.eyebrow}</Text>
          </View>
          <View style={[styles.runtimePill, { backgroundColor: runtime.wash }]}>
            <View style={[styles.runtimeDot, { backgroundColor: runtime.accent }]} />
            <Text style={[styles.runtimePillText, { color: runtime.accent }]}>{runtime.label}</Text>
          </View>
        </View>

        <Text style={styles.agentName}>{item.name}</Text>
        <Text style={styles.agentLead}>{attention.summary}</Text>

        <View style={styles.statGrid}>
          <View style={styles.statBlock}>
            <Text style={styles.statLabel}>Stablecoin balance</Text>
            <Text style={styles.statValue}>{item.stablecoinSymbol} {formatCurrencyAmount(item.stablecoinBalance)}</Text>
          </View>
          <View style={styles.statBlock}>
            <Text style={styles.statLabel}>Last active</Text>
            <Text style={styles.statValue}>{formatRelativeTime(item.lastActiveAt)}</Text>
          </View>
        </View>

        <View style={styles.walletStrip}>
          <Ionicons name="wallet-outline" size={16} color={TEXT_SECONDARY} />
          <Text style={styles.addressText}>{formatWalletAddress(item.walletAddress)}</Text>
        </View>

        <View style={styles.cardFooter}>
          <View>
            <Text style={styles.footerLabel}>Next step</Text>
            <Text style={styles.footerAction}>{attention.nextAction}</Text>
          </View>
          <View style={styles.footerArrow}>
            <Ionicons name="arrow-forward" size={18} color={BLUE} />
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.heroCard}>
        <Text style={styles.eyebrow}>Regents Mobile</Text>
        <Text style={styles.heroTitle}>Agents</Text>
        <Text style={styles.heroIntro}>
          These sample cards show how agent updates, balances, and reviews may look in a later build.
        </Text>
        <PreviewNotice body="These are built-in sample agents. They do not reflect a live Regent account yet, and the money controls on the next screen stay in preview mode." />
        <View style={styles.summaryRow}>
          <View style={styles.summaryTile}>
            <Text style={styles.summaryValue}>{summary.attentionCount}</Text>
            <Text style={styles.summaryLabel}>Need review</Text>
          </View>
          <View style={styles.summaryTile}>
            <Text style={styles.summaryValue}>{summary.waitingCount}</Text>
            <Text style={styles.summaryLabel}>Waiting</Text>
          </View>
          <View style={styles.summaryTile}>
            <Text style={styles.summaryValue}>{summary.steadyCount}</Text>
            <Text style={styles.summaryLabel}>Steady</Text>
          </View>
        </View>
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={BLUE} />
          <Text style={styles.loadingText}>Loading sample agent cards…</Text>
        </View>
      ) : (
        <FlatList
          data={sortedAgents}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadAgents(true)} tintColor={BLUE} />}
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <Ionicons name="people-outline" size={34} color={BLUE} />
              <Text style={styles.emptyTitle}>No sample cards yet</Text>
              <Text style={styles.emptyText}>Sample agent cards will appear here when this preview data is available.</Text>
            </View>
          }
        />
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
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  heroCard: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 24,
    padding: 22,
    gap: 12,
    marginBottom: 16,
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
    fontSize: 30,
    fontFamily: FONTS.heading,
  },
  heroIntro: {
    color: TEXT_SECONDARY,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: FONTS.body,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  summaryTile: {
    flex: 1,
    backgroundColor: WHITE,
    borderRadius: 16,
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
  listContent: {
    paddingBottom: 28,
    gap: 14,
  },
  centerState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: TEXT_SECONDARY,
    fontSize: 15,
    fontFamily: FONTS.body,
  },
  agentCard: {
    backgroundColor: CARD_ALT,
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
    gap: 14,
  },
  cardPressed: {
    opacity: 0.96,
    transform: [{ scale: 0.985 }, { translateY: 1 }],
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  priorityPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  priorityPillText: {
    fontSize: 12,
    fontFamily: FONTS.body,
  },
  runtimePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  runtimeDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  runtimePillText: {
    fontSize: 12,
    fontFamily: FONTS.body,
  },
  agentName: {
    color: TEXT_PRIMARY,
    fontSize: 24,
    fontFamily: FONTS.heading,
  },
  agentLead: {
    color: TEXT_PRIMARY,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: FONTS.body,
  },
  statGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  statBlock: {
    flex: 1,
    backgroundColor: WHITE,
    borderRadius: 16,
    padding: 14,
    gap: 6,
  },
  statLabel: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    fontFamily: FONTS.body,
  },
  statValue: {
    color: TEXT_PRIMARY,
    fontSize: 16,
    fontFamily: FONTS.heading,
  },
  walletStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 2,
  },
  addressText: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    fontFamily: FONTS.body,
  },
  cardFooter: {
    backgroundColor: BLUE_WASH,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  footerLabel: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    fontFamily: FONTS.body,
  },
  footerAction: {
    color: BLUE,
    fontSize: 15,
    marginTop: 2,
    fontFamily: FONTS.heading,
  },
  footerArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: WHITE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCard: {
    backgroundColor: CARD_BG,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: BORDER,
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
