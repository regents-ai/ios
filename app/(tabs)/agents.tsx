import { CoinbaseAlert } from '@/components/ui/CoinbaseAlerts';
import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import { AgentSummary } from '@/types/agents';
import { fetchAgents } from '@/utils/fetchAgents';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const { DARK_BG, CARD_BG, CARD_ALT, TEXT_PRIMARY, TEXT_SECONDARY, BLUE, BORDER, WHITE, SUCCESS, DANGER } = COLORS;

function formatAddress(address: string) {
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

function formatCurrency(amount: string) {
  return Number(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatRelativeTime(dateString: string) {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const diffMinutes = Math.max(1, Math.round(diffMs / 60000));
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.round(diffHours / 24)}d ago`;
}

function statusAccent(status: AgentSummary['status']) {
  switch (status) {
    case 'active':
      return SUCCESS;
    case 'attention':
      return '#A3703A';
    case 'paused':
      return DANGER;
  }
}

function runtimeCopy(runtimeStatus: AgentSummary['runtimeStatus']) {
  switch (runtimeStatus) {
    case 'online':
      return 'Online';
    case 'waiting':
      return 'Waiting';
    case 'offline':
      return 'Offline';
  }
}

export default function AgentsTab() {
  const router = useRouter();
  const [agents, setAgents] = useState<AgentSummary[]>([]);
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

      const nextAgents = await fetchAgents();
      setAgents(nextAgents);
    } catch (error) {
      setAlertState({
        visible: true,
        title: 'Unable to load agents',
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

  const renderItem = ({ item }: { item: AgentSummary }) => {
    const accent = statusAccent(item.status);

    return (
      <Pressable
        onPress={() => router.push({ pathname: '/agent/[id]' as any, params: { id: item.id } })}
        style={({ pressed }) => [
          styles.agentCard,
          pressed && styles.cardPressed,
        ]}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleBlock}>
            <View style={[styles.statusDot, { backgroundColor: accent }]} />
            <Text style={styles.agentName}>{item.name}</Text>
          </View>
          <View style={[styles.statusPill, { borderColor: accent }]}>
            <Text style={[styles.statusPillText, { color: accent }]}>{runtimeCopy(item.runtimeStatus)}</Text>
          </View>
        </View>

        <Text style={styles.agentNote}>{item.treasuryNote || 'Treasury status is available in the agent detail view.'}</Text>

        <View style={styles.statGrid}>
          <View style={styles.statBlock}>
            <Text style={styles.statLabel}>Balance</Text>
            <Text style={styles.statValue}>{item.stablecoinSymbol} {formatCurrency(item.stablecoinBalance)}</Text>
          </View>
          <View style={styles.statBlock}>
            <Text style={styles.statLabel}>Last active</Text>
            <Text style={styles.statValue}>{formatRelativeTime(item.lastActiveAt)}</Text>
          </View>
        </View>

        <View style={styles.addressRow}>
          <Ionicons name="wallet-outline" size={16} color={TEXT_SECONDARY} />
          <Text style={styles.addressText}>{formatAddress(item.walletAddress)}</Text>
        </View>

        <View style={styles.cardFooter}>
          <Text style={styles.footerHint}>Open agent</Text>
          <Ionicons name="chevron-forward" size={18} color={BLUE} />
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
          Track each agent’s treasury, see who needs attention, and move into funding or withdrawal requests from one place.
        </Text>
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={BLUE} />
          <Text style={styles.loadingText}>Loading your agents…</Text>
        </View>
      ) : (
        <FlatList
          data={agents}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadAgents(true)} tintColor={BLUE} />}
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <Ionicons name="people-outline" size={34} color={BLUE} />
              <Text style={styles.emptyTitle}>No agents yet</Text>
              <Text style={styles.emptyText}>When your first agent is ready, it will appear here with its wallet and treasury status.</Text>
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
    gap: 10,
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
    borderRadius: 22,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 18,
    gap: 14,
  },
  cardPressed: {
    opacity: 0.92,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  cardTitleBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  agentName: {
    color: TEXT_PRIMARY,
    fontSize: 22,
    fontFamily: FONTS.heading,
    flexShrink: 1,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: WHITE,
  },
  statusPillText: {
    fontSize: 12,
    fontFamily: FONTS.body,
  },
  agentNote: {
    color: TEXT_SECONDARY,
    fontSize: 14,
    lineHeight: 20,
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
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addressText: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    fontFamily: FONTS.body,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  footerHint: {
    color: BLUE,
    fontSize: 14,
    fontFamily: FONTS.body,
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
