import { StatusPill } from '@/components/agent-surfaces/StatusPill';
import { LiveValueFlash } from '@/components/motion/LiveValueFlash';
import { CoinbaseAlert } from '@/components/ui/CoinbaseAlerts';
import { RegentPressable } from '@/components/ui/RegentPressable';
import { useCoinbaseAlert } from '@/hooks/useCoinbaseAlert';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import type { MobileAgent } from '@/types/regents';
import { formatWalletAddress } from '@/utils/agent-surfaces/formatters';
import { agentKindLabel, formatUsdcBalance } from '@/utils/agents/kinds';
import { describeApiError } from '@/utils/apiError';
import { routes } from '@/utils/navigation/routes';
import { regentApi } from '@/utils/regentApi/client';
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

export default function AgentsTab() {
  const router = useRouter();
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [agents, setAgents] = useState<MobileAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { alertProps, showAlert } = useCoinbaseAlert();

  const loadAgents = useCallback(async (refresh = false) => {
    try {
      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setAgents(await regentApi.listAgents());
    } catch (error) {
      showAlert({
        title: 'Could not load your agents',
        message: describeApiError(error).message,
        type: 'error',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showAlert]);

  useFocusEffect(
    useCallback(() => {
      loadAgents();
    }, [loadAgents])
  );

  return (
    <View style={styles.container}>
      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Loading your agents…</Text>
        </View>
      ) : (
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadAgents(true)} tintColor={colors.accent} />}
        >
          <View style={styles.heroCard}>
            <Text style={styles.eyebrow}>My agents</Text>
            <Text style={styles.heroTitle}>Fund the agents that work for you</Text>
            <Text style={styles.heroBody}>
              Add an agent, then send it Base USDC from your wallet whenever it needs funds.
            </Text>
            <View style={styles.heroActions}>
              <RegentPressable onPress={() => router.push(routes.addAgent())} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>Add agent</Text>
              </RegentPressable>
              <RegentPressable onPress={() => router.push(routes.wallet())} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Add USDC</Text>
              </RegentPressable>
            </View>
          </View>

          {agents.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="people-outline" size={28} color={colors.accent} />
              <Text style={styles.emptyTitle}>Add your first agent</Text>
              <Text style={styles.emptyText}>
                Give an agent a pairing code, or paste its wallet address, and it will show up here with its USDC balance.
              </Text>
              <RegentPressable onPress={() => router.push(routes.addAgent())} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>Add agent</Text>
              </RegentPressable>
            </View>
          ) : (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Your agents</Text>
              <View style={styles.agentList}>
                {agents.map((agent) => (
                  <RegentPressable
                    key={agent.id}
                    onPress={() => router.push(routes.agent(agent.id))}
                    pressStyle="card"
                    style={styles.agentRow}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${agent.name}`}
                  >
                    <View style={styles.agentRowTop}>
                      <View style={styles.agentRowCopy}>
                        <Text style={styles.agentName}>{agent.name}</Text>
                        <Text style={styles.agentMeta}>
                          {agentKindLabel(agent.kind)} · {formatWalletAddress(agent.walletAddress)}
                        </Text>
                      </View>
                      {agent.paired ? (
                        <StatusPill label="Paired" color={colors.success} backgroundColor={colors.successWash} showDot />
                      ) : (
                        <StatusPill label="Address only" color={colors.textMuted} backgroundColor={colors.surface} />
                      )}
                    </View>
                    <LiveValueFlash value={`${agent.id}-${agent.usdcBalance ?? 'none'}`} style={styles.balanceFlash}>
                      <Text style={styles.agentBalance}>{formatUsdcBalance(agent.usdcBalance)}</Text>
                    </LiveValueFlash>
                  </RegentPressable>
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      )}

      <CoinbaseAlert {...alertProps} />
    </View>
  );
}

function makeStyles({ colors, fonts }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg,
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
      color: colors.textMuted,
      fontSize: 15,
      fontFamily: fonts.ui,
    },
    heroCard: {
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.hairlineStrong,
      borderRadius: 28,
      padding: 22,
      gap: 14,
    },
    eyebrow: {
      color: colors.accent,
      fontSize: 12,
      letterSpacing: 1,
      textTransform: 'uppercase',
      fontFamily: fonts.ui,
    },
    heroTitle: {
      color: colors.text,
      fontSize: 32,
      lineHeight: 38,
      fontFamily: fonts.title,
    },
    heroBody: {
      color: colors.textMuted,
      fontSize: 15,
      lineHeight: 22,
      fontFamily: fonts.ui,
    },
    heroActions: {
      flexDirection: 'row',
      gap: 10,
      flexWrap: 'wrap',
    },
    primaryButton: {
      flexGrow: 1,
      backgroundColor: colors.accent,
      borderRadius: 16,
      paddingHorizontal: 18,
      paddingVertical: 13,
      alignItems: 'center',
    },
    primaryButtonText: {
      color: colors.onAccent,
      fontSize: 14,
      fontFamily: fonts.ui,
    },
    secondaryButton: {
      flexGrow: 1,
      backgroundColor: colors.surface,
      borderRadius: 16,
      paddingHorizontal: 18,
      paddingVertical: 13,
      borderWidth: 1,
      borderColor: colors.hairlineStrong,
      alignItems: 'center',
    },
    secondaryButtonText: {
      color: colors.text,
      fontSize: 14,
      fontFamily: fonts.ui,
    },
    section: {
      gap: 12,
    },
    sectionTitle: {
      color: colors.text,
      fontSize: 22,
      fontFamily: fonts.title,
    },
    agentList: {
      gap: 10,
    },
    agentRow: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.hairlineStrong,
      borderRadius: 20,
      padding: 16,
      gap: 10,
    },
    agentRowTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: 12,
    },
    agentRowCopy: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    agentName: {
      color: colors.text,
      fontSize: 18,
      fontFamily: fonts.title,
    },
    agentMeta: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 19,
      fontFamily: fonts.ui,
    },
    balanceFlash: {
      alignSelf: 'flex-start',
    },
    agentBalance: {
      color: colors.text,
      fontSize: 16,
      lineHeight: 22,
      fontFamily: fonts.title,
    },
    emptyCard: {
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.hairlineStrong,
      borderRadius: 24,
      padding: 28,
      alignItems: 'center',
      gap: 12,
    },
    emptyTitle: {
      color: colors.text,
      fontSize: 24,
      fontFamily: fonts.title,
    },
    emptyText: {
      color: colors.textMuted,
      fontSize: 14,
      lineHeight: 20,
      textAlign: 'center',
      fontFamily: fonts.ui,
    },
  });
}
