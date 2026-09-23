import { StatusPill } from '@/components/agent-surfaces/StatusPill';
import { LiveValueFlash } from '@/components/motion/LiveValueFlash';
import { SpinningRefreshIcon } from '@/components/motion/SpinningRefreshIcon';
import { CoinbaseAlert } from '@/components/ui/CoinbaseAlerts';
import { RegentPressable } from '@/components/ui/RegentPressable';
import { useCoinbaseAlert } from '@/hooks/useCoinbaseAlert';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import type { MobileAgent } from '@/types/regents';
import { agentKindLabel, formatUsdcBalance } from '@/utils/agents/kinds';
import { describeApiError } from '@/utils/apiError';
import { routes } from '@/utils/navigation/routes';
import { regentApi } from '@/utils/regentApi/client';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

export default function AgentDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const agentId = typeof params.id === 'string' ? params.id : '';
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [agent, setAgent] = useState<MobileAgent | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [copied, setCopied] = useState(false);
  const { alertProps, showAlert } = useCoinbaseAlert();

  const loadAgent = useCallback(async (refresh = false) => {
    if (!agentId) {
      setLoading(false);
      return;
    }

    try {
      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      const agents = await regentApi.listAgents();
      setAgent(agents.find((candidate) => candidate.id === agentId) ?? null);
    } catch (error) {
      showAlert({
        title: 'This agent is unavailable right now',
        message: describeApiError(error).message,
        type: 'error',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [agentId, showAlert]);

  useFocusEffect(
    useCallback(() => {
      loadAgent();
    }, [loadAgent])
  );

  const openAddFunds = useCallback(() => {
    if (!agent) {
      return;
    }

    router.push(routes.walletSend({
      flow: 'agent-funding',
      recipientAddress: agent.walletAddress,
      recipientLabel: agent.name,
    }));
  }, [agent, router]);

  const copyAddress = useCallback(async () => {
    if (!agent) {
      return;
    }
    await Clipboard.setStringAsync(agent.walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [agent]);

  const startRename = useCallback(() => {
    if (!agent) {
      return;
    }
    setDraftName(agent.name);
    setRenaming(true);
  }, [agent]);

  const saveName = useCallback(async () => {
    if (!agent) {
      return;
    }
    const name = draftName.trim();
    if (!name) {
      showAlert({ title: 'Name needed', message: 'Give this agent a name before saving.', type: 'error' });
      return;
    }

    setSavingName(true);
    try {
      const renamed = await regentApi.renameAgent(agent.id, { name });
      setAgent({ ...agent, name: renamed.name });
      setRenaming(false);
    } catch (error) {
      showAlert({ title: 'Could not rename this agent', message: describeApiError(error).message, type: 'error' });
    } finally {
      setSavingName(false);
    }
  }, [agent, draftName, showAlert]);

  const removeAgent = useCallback(() => {
    if (!agent) {
      return;
    }

    Alert.alert(
      `Remove ${agent.name}?`,
      'It leaves your list. Its wallet and funds are not affected. You can add it again any time.',
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await regentApi.removeAgent(agent.id);
              router.back();
            } catch (error) {
              showAlert({ title: 'Could not remove this agent', message: describeApiError(error).message, type: 'error' });
            }
          },
        },
      ]
    );
  }, [agent, router, showAlert]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Loading agent…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!agent) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerState}>
          <Text style={styles.emptyTitle}>This agent is not in your list</Text>
          <RegentPressable style={styles.primaryButton} onPress={() => router.back()}>
            <Text style={styles.primaryButtonText}>Back</Text>
          </RegentPressable>
        </View>
        <CoinbaseAlert {...alertProps} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <RegentPressable
          accessibilityLabel="Go back"
          accessibilityRole="button"
          pressStyle="icon"
          onPress={() => router.back()}
          style={styles.iconButton}
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </RegentPressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{agent.name}</Text>
        <RegentPressable
          accessibilityLabel="Refresh agent"
          accessibilityRole="button"
          accessibilityState={{ busy: refreshing, disabled: refreshing }}
          pressStyle="icon"
          onPress={() => loadAgent(true)}
          disabled={refreshing}
          style={styles.iconButton}
        >
          <SpinningRefreshIcon refreshing={refreshing} size={18} color={colors.accent} />
        </RegentPressable>
      </View>

      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View style={styles.heroTitleBlock}>
              <Text style={styles.eyebrow}>{agentKindLabel(agent.kind)}</Text>
              {renaming ? (
                <TextInput
                  value={draftName}
                  onChangeText={setDraftName}
                  autoFocus
                  maxLength={60}
                  placeholder="Agent name"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                  accessibilityLabel="Agent name"
                  editable={!savingName}
                  onSubmitEditing={saveName}
                  returnKeyType="done"
                />
              ) : (
                <Text style={styles.heroTitle}>{agent.name}</Text>
              )}
            </View>
            {agent.paired ? (
              <StatusPill label="Paired" color={colors.success} backgroundColor={colors.successWash} showDot />
            ) : (
              <StatusPill label="Address only" color={colors.textMuted} backgroundColor={colors.surface} />
            )}
          </View>

          {renaming ? (
            <View style={styles.heroActions}>
              <RegentPressable style={styles.primaryButton} onPress={saveName} disabled={savingName}>
                <Text style={styles.primaryButtonText}>{savingName ? 'Saving…' : 'Save name'}</Text>
              </RegentPressable>
              <RegentPressable style={styles.secondaryButton} onPress={() => setRenaming(false)} disabled={savingName}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </RegentPressable>
            </View>
          ) : (
            <>
              <View style={styles.balanceBlock}>
                <Text style={styles.metaLabel}>USDC balance</Text>
                <LiveValueFlash value={`balance-${agent.usdcBalance ?? 'none'}`}>
                  <Text style={styles.balanceValue}>{formatUsdcBalance(agent.usdcBalance)}</Text>
                </LiveValueFlash>
                <Text style={styles.metaHint}>Base USDC held by the wallet of this agent.</Text>
              </View>
              <View style={styles.heroActions}>
                <RegentPressable style={styles.primaryButton} onPress={openAddFunds}>
                  <Text style={styles.primaryButtonText}>Add funds</Text>
                </RegentPressable>
                <RegentPressable style={styles.secondaryButton} onPress={startRename}>
                  <Text style={styles.secondaryButtonText}>Rename</Text>
                </RegentPressable>
              </View>
            </>
          )}
        </View>

        {!agent.paired ? (
          <View style={[styles.card, styles.pairCard]}>
            <Text style={styles.sectionTitle}>Pair this agent</Text>
            <Text style={styles.sectionHint}>
              Pairing lets the agent prove it owns this wallet. You will get a code to give it.
            </Text>
            <RegentPressable
              style={styles.primaryButton}
              onPress={() => router.push(routes.agentPairing({ name: agent.name, kind: agent.kind }))}
            >
              <Text style={styles.primaryButtonText}>Get a pairing code</Text>
            </RegentPressable>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Wallet address</Text>
          <Text style={styles.sectionHint}>Funds you add go to this Base address.</Text>
          <Text selectable style={styles.address}>{agent.walletAddress}</Text>
          <RegentPressable style={styles.secondaryButton} onPress={copyAddress} accessibilityLabel="Copy wallet address">
            <Text style={styles.secondaryButtonText}>{copied ? 'Copied' : 'Copy address'}</Text>
          </RegentPressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Remove from my agents</Text>
          <Text style={styles.sectionHint}>Takes this agent off your list. Its wallet keeps its funds.</Text>
          <RegentPressable style={styles.dangerButton} onPress={removeAgent}>
            <Text style={styles.dangerButtonText}>Remove agent</Text>
          </RegentPressable>
        </View>
      </ScrollView>

      <CoinbaseAlert {...alertProps} />
    </SafeAreaView>
  );
}

function makeStyles({ colors, fonts }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 8,
      gap: 12,
    },
    iconButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.hairlineStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      flex: 1,
      minWidth: 0,
      color: colors.text,
      fontSize: 20,
      lineHeight: 24,
      textAlign: 'center',
      fontFamily: fonts.title,
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingBottom: 32,
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
    emptyTitle: {
      color: colors.text,
      fontSize: 26,
      textAlign: 'center',
      fontFamily: fonts.title,
    },
    heroCard: {
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.hairlineStrong,
      borderRadius: 24,
      padding: 22,
      gap: 16,
    },
    heroTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: 12,
    },
    heroTitleBlock: {
      flex: 1,
      minWidth: 0,
      gap: 6,
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
      fontSize: 30,
      fontFamily: fonts.title,
    },
    input: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.hairlineStrong,
      borderRadius: 16,
      padding: 14,
      fontSize: 18,
      color: colors.text,
      fontFamily: fonts.title,
    },
    balanceBlock: {
      backgroundColor: colors.surface,
      borderRadius: 18,
      padding: 16,
      gap: 4,
    },
    metaLabel: {
      color: colors.textMuted,
      fontSize: 12,
      textTransform: 'uppercase',
      fontFamily: fonts.ui,
    },
    balanceValue: {
      color: colors.text,
      fontSize: 26,
      lineHeight: 32,
      fontFamily: fonts.title,
    },
    metaHint: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 18,
      fontFamily: fonts.ui,
    },
    heroActions: {
      flexDirection: 'row',
      gap: 10,
      flexWrap: 'wrap',
    },
    primaryButton: {
      minWidth: 120,
      flexGrow: 1,
      backgroundColor: colors.accent,
      borderRadius: 16,
      paddingHorizontal: 18,
      paddingVertical: 13,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryButtonText: {
      color: colors.onAccent,
      fontSize: 14,
      fontFamily: fonts.ui,
    },
    secondaryButton: {
      minWidth: 120,
      flexGrow: 1,
      backgroundColor: colors.surface,
      borderRadius: 16,
      paddingHorizontal: 18,
      paddingVertical: 13,
      borderWidth: 1,
      borderColor: colors.hairlineStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryButtonText: {
      color: colors.text,
      fontSize: 14,
      fontFamily: fonts.ui,
    },
    dangerButton: {
      alignSelf: 'flex-start',
      backgroundColor: colors.errorWash,
      borderRadius: 16,
      paddingHorizontal: 18,
      paddingVertical: 13,
      alignItems: 'center',
    },
    dangerButtonText: {
      color: colors.error,
      fontSize: 14,
      fontFamily: fonts.ui,
    },
    card: {
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.hairlineStrong,
      borderRadius: 24,
      padding: 20,
      gap: 12,
    },
    pairCard: {
      backgroundColor: colors.accentWash,
      borderColor: colors.accentWash,
    },
    sectionTitle: {
      color: colors.text,
      fontSize: 22,
      fontFamily: fonts.title,
    },
    sectionHint: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 19,
      fontFamily: fonts.ui,
    },
    address: {
      color: colors.text,
      fontSize: 14,
      lineHeight: 20,
      fontFamily: fonts.ui,
    },
  });
}
