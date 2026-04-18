import { CoinbaseAlert } from '@/components/ui/CoinbaseAlerts';
import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import { PaperclipDetail } from '@/types/agents';
import { fetchAgentPaperclip } from '@/utils/fetchAgentPaperclip';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';

const { DARK_BG, CARD_BG, CARD_ALT, TEXT_PRIMARY, TEXT_SECONDARY, BLUE, BORDER, WHITE, BLUE_WASH } = COLORS;

function statusTone(status: string) {
  const lower = status.toLowerCase();
  if (lower.includes('attention') || lower.includes('waiting')) {
    return { backgroundColor: '#F2E7DA', color: '#A3703A' };
  }

  if (lower.includes('track') || lower.includes('online') || lower.includes('ready')) {
    return { backgroundColor: '#E6F0EA', color: '#2E6B4E' };
  }

  return { backgroundColor: BLUE_WASH, color: BLUE };
}

export default function AgentPaperclipScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const agentId = typeof params.id === 'string' ? params.id : '';
  const [paperclip, setPaperclip] = useState<PaperclipDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDashboard, setShowDashboard] = useState(false);
  const [dashboardFailed, setDashboardFailed] = useState(false);
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

  const loadPaperclip = useCallback(async () => {
    if (!agentId) {
      return;
    }

    try {
      setLoading(true);
      setPaperclip(await fetchAgentPaperclip(agentId));
    } catch (error) {
      setAlertState({
        visible: true,
        title: 'Unable to load Paperclip',
        message: error instanceof Error ? error.message : 'Try again in a moment.',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useFocusEffect(
    useCallback(() => {
      loadPaperclip();
    }, [loadPaperclip])
  );

  const openBrowser = async () => {
    if (!paperclip) {
      return;
    }

    try {
      await Linking.openURL(paperclip.dashboardUrl);
    } catch (error) {
      setAlertState({
        visible: true,
        title: 'Unable to open full view',
        message: error instanceof Error ? error.message : 'Try again in a moment.',
        type: 'error',
      });
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={BLUE} />
          <Text style={styles.loadingText}>Loading Paperclip…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!paperclip) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerState}>
          <Text style={styles.emptyTitle}>This Paperclip view is unavailable</Text>
          <Pressable style={styles.primaryButton} onPress={() => router.back()}>
            <Text style={styles.primaryButtonText}>Back to agent</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconButton}>
          <Ionicons name="chevron-back" size={22} color={TEXT_PRIMARY} />
        </Pressable>
        <Text style={styles.headerTitle}>Paperclip</Text>
        <Pressable onPress={loadPaperclip} style={styles.iconButton}>
          <Ionicons name="refresh" size={18} color={BLUE} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.heroCard}>
          <Text style={styles.eyebrow}>Mobile summary</Text>
          <Text style={styles.heroTitle}>{paperclip.headline}</Text>
          <Text style={styles.heroBody}>{paperclip.companySummary}</Text>
          <View style={styles.heroActions}>
            <Pressable style={styles.primaryButton} onPress={() => setShowDashboard((current) => !current)}>
              <Text style={styles.primaryButtonText}>{showDashboard ? 'Hide full view' : 'Show full view'}</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={openBrowser}>
              <Text style={styles.secondaryButtonText}>Open in browser</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Goals</Text>
          <View style={styles.list}>
            {paperclip.goals.map((goal) => {
              const tone = statusTone(goal.status);
              return (
                <View key={goal.id} style={styles.listCard}>
                  <View style={styles.listHeader}>
                    <Text style={styles.listTitle}>{goal.title}</Text>
                    <View style={[styles.statusPill, { backgroundColor: tone.backgroundColor }]}>
                      <Text style={[styles.statusPillText, { color: tone.color }]}>{goal.status}</Text>
                    </View>
                  </View>
                  {goal.note ? <Text style={styles.listBody}>{goal.note}</Text> : null}
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Active tasks</Text>
          <View style={styles.list}>
            {paperclip.activeTasks.map((task) => {
              const tone = statusTone(task.status);
              return (
                <View key={task.id} style={styles.listCard}>
                  <View style={styles.listHeader}>
                    <Text style={styles.listTitle}>{task.title}</Text>
                    <View style={[styles.statusPill, { backgroundColor: tone.backgroundColor }]}>
                      <Text style={[styles.statusPillText, { color: tone.color }]}>{task.status}</Text>
                    </View>
                  </View>
                  <Text style={styles.metaText}>{task.owner ? `Owner: ${task.owner}` : 'Owner not listed'}</Text>
                  {task.note ? <Text style={styles.listBody}>{task.note}</Text> : null}
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Recent events</Text>
          <View style={styles.list}>
            {paperclip.recentEvents.map((event) => (
              <View key={event.id} style={styles.listCard}>
                <Text style={styles.listTitle}>{event.title}</Text>
                <Text style={styles.metaText}>{new Date(event.at).toLocaleString()}</Text>
                <Text style={styles.listBody}>{event.detail}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Team</Text>
          <View style={styles.list}>
            {paperclip.roster.map((member) => {
              const tone = statusTone(member.status);
              return (
                <View key={member.id} style={styles.memberRow}>
                  <View>
                    <Text style={styles.memberName}>{member.name}</Text>
                    <Text style={styles.memberRole}>{member.role}</Text>
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: tone.backgroundColor }]}>
                    <Text style={[styles.statusPillText, { color: tone.color }]}>{member.status}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {showDashboard ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Full view</Text>
            <Text style={styles.sectionHint}>Use the larger dashboard when you want the complete picture.</Text>
            {Platform.OS === 'web' ? (
              <View style={styles.emptyPanel}>
                <Text style={styles.emptyPanelText}>Open the full view in a browser from this device.</Text>
              </View>
            ) : dashboardFailed ? (
              <View style={styles.emptyPanel}>
                <Text style={styles.emptyPanelText}>The full view could not load here. Open it in a browser instead.</Text>
              </View>
            ) : (
              <View style={styles.webViewFrame}>
                <WebView
                  source={{ uri: paperclip.dashboardUrl }}
                  onError={() => setDashboardFailed(true)}
                  startInLoadingState
                  renderLoading={() => (
                    <View style={styles.webViewLoading}>
                      <ActivityIndicator size="small" color={BLUE} />
                      <Text style={styles.loadingText}>Opening full view…</Text>
                    </View>
                  )}
                />
              </View>
            )}
          </View>
        ) : null}
      </ScrollView>

      <CoinbaseAlert
        visible={alertState.visible}
        title={alertState.title}
        message={alertState.message}
        type={alertState.type}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
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
  headerTitle: {
    color: TEXT_PRIMARY,
    fontSize: 20,
    fontFamily: FONTS.heading,
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
    color: TEXT_SECONDARY,
    fontSize: 15,
    fontFamily: FONTS.body,
  },
  emptyTitle: {
    color: TEXT_PRIMARY,
    fontSize: 26,
    textAlign: 'center',
    fontFamily: FONTS.heading,
  },
  heroCard: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 24,
    padding: 22,
    gap: 12,
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
    fontSize: 28,
    lineHeight: 34,
    fontFamily: FONTS.heading,
  },
  heroBody: {
    color: TEXT_SECONDARY,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: FONTS.body,
  },
  heroActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  card: {
    backgroundColor: CARD_ALT,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 18,
    gap: 14,
  },
  sectionTitle: {
    color: TEXT_PRIMARY,
    fontSize: 22,
    fontFamily: FONTS.heading,
  },
  sectionHint: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FONTS.body,
    marginTop: -6,
  },
  list: {
    gap: 12,
  },
  listCard: {
    backgroundColor: WHITE,
    borderRadius: 16,
    padding: 14,
    gap: 6,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  listTitle: {
    flex: 1,
    color: TEXT_PRIMARY,
    fontSize: 16,
    lineHeight: 22,
    fontFamily: FONTS.heading,
  },
  listBody: {
    color: TEXT_SECONDARY,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONTS.body,
  },
  metaText: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    fontFamily: FONTS.body,
  },
  memberRow: {
    backgroundColor: WHITE,
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  memberName: {
    color: TEXT_PRIMARY,
    fontSize: 16,
    fontFamily: FONTS.heading,
  },
  memberRole: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    fontFamily: FONTS.body,
    marginTop: 4,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusPillText: {
    fontSize: 12,
    fontFamily: FONTS.body,
  },
  primaryButton: {
    backgroundColor: BLUE,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: WHITE,
    fontSize: 14,
    fontFamily: FONTS.body,
  },
  secondaryButton: {
    backgroundColor: WHITE,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: BORDER,
  },
  secondaryButtonText: {
    color: TEXT_PRIMARY,
    fontSize: 14,
    fontFamily: FONTS.body,
  },
  emptyPanel: {
    backgroundColor: WHITE,
    borderRadius: 16,
    padding: 16,
  },
  emptyPanelText: {
    color: TEXT_SECONDARY,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONTS.body,
  },
  webViewFrame: {
    height: 420,
    overflow: 'hidden',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: WHITE,
  },
  webViewLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: WHITE,
  },
});
