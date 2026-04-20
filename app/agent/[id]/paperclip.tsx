import { CoinbaseAlert } from '@/components/ui/CoinbaseAlerts';
import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import { PaperclipDetail } from '@/types/agents';
import { fetchAgentPaperclip } from '@/utils/fetchAgentPaperclip';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
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

const { DARK_BG, CARD_BG, CARD_ALT, TEXT_PRIMARY, TEXT_SECONDARY, BLUE, BORDER, WHITE, BLUE_WASH, SUCCESS, DANGER } = COLORS;

const AMBER = '#A3703A';
const AMBER_WASH = '#F2E7DA';
const GREEN_WASH = '#E6F0EA';
const RED_WASH = '#F3E1DD';

function statusTone(status: string) {
  const lower = status.toLowerCase();

  if (lower.includes('attention') || lower.includes('waiting') || lower.includes('blocked')) {
    return { backgroundColor: AMBER_WASH, color: AMBER };
  }

  if (lower.includes('offline') || lower.includes('risk') || lower.includes('stalled')) {
    return { backgroundColor: RED_WASH, color: DANGER };
  }

  if (lower.includes('track') || lower.includes('online') || lower.includes('ready')) {
    return { backgroundColor: GREEN_WASH, color: SUCCESS };
  }

  return { backgroundColor: BLUE_WASH, color: BLUE };
}

function formatRelativeTime(dateString: string) {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const diffMinutes = Math.max(1, Math.round(diffMs / 60000));
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.round(diffHours / 24)}d ago`;
}

function readyRosterCount(paperclip: PaperclipDetail | null) {
  if (!paperclip) {
    return 0;
  }

  return paperclip.roster.filter((member) => {
    const lower = member.status.toLowerCase();
    return lower.includes('ready') || lower.includes('online') || lower.includes('track');
  }).length;
}

export default function AgentPaperclipScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const agentId = typeof params.id === 'string' ? params.id : '';
  const [paperclip, setPaperclip] = useState<PaperclipDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDashboard, setShowDashboard] = useState(false);
  const [dashboardFailed, setDashboardFailed] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const dashboardAnim = useRef(new Animated.Value(0)).current;
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

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => setReduceMotion(false));
  }, []);

  useEffect(() => {
    if (!showDashboard) {
      dashboardAnim.setValue(0);
      return;
    }

    if (reduceMotion) {
      dashboardAnim.setValue(1);
      return;
    }

    dashboardAnim.setValue(0);
    Animated.timing(dashboardAnim, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [dashboardAnim, reduceMotion, showDashboard]);

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

  const paperclipSummary = useMemo(() => {
    if (!paperclip) {
      return null;
    }

    const topGoal = paperclip.goals[0];
    const nextTask = paperclip.activeTasks[0];
    const latestEvent = paperclip.recentEvents[0];
    const readyCount = readyRosterCount(paperclip);
    const attentionItem = [...paperclip.goals, ...paperclip.activeTasks].find((item) => {
      const lower = item.status.toLowerCase();
      return lower.includes('attention') || lower.includes('waiting') || lower.includes('blocked');
    });

    return {
      topGoal,
      nextTask,
      latestEvent,
      readyCount,
      briefingLabel: attentionItem ? 'Needs eyes now' : 'Steady progress',
      briefingTone: attentionItem ? { wash: AMBER_WASH, accent: AMBER } : { wash: GREEN_WASH, accent: SUCCESS },
      focusTitle: attentionItem?.title || nextTask?.title || topGoal?.title || 'No immediate issue listed',
      focusBody: attentionItem?.note || nextTask?.note || topGoal?.note || 'The latest update will appear here once this agent shares more context.',
    };
  }, [paperclip]);

  const dashboardAnimatedStyle = {
    opacity: dashboardAnim,
    transform: [
      {
        translateY: dashboardAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [18, 0],
        }),
      },
    ],
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

  if (!paperclip || !paperclipSummary) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerState}>
          <Text style={styles.emptyTitle}>This Paperclip view is unavailable</Text>
          <Pressable style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]} onPress={() => router.back()}>
            <Text style={styles.primaryButtonText}>Back to agent</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}>
          <Ionicons name="chevron-back" size={22} color={TEXT_PRIMARY} />
        </Pressable>
        <Text style={styles.headerTitle}>Paperclip</Text>
        <Pressable onPress={loadPaperclip} style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}>
          <Ionicons name="refresh" size={18} color={BLUE} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <Text style={styles.eyebrow}>Mobile briefing</Text>
            <View style={[styles.heroPill, { backgroundColor: paperclipSummary.briefingTone.wash }]}>
              <Text style={[styles.heroPillText, { color: paperclipSummary.briefingTone.accent }]}>
                {paperclipSummary.briefingLabel}
              </Text>
            </View>
          </View>
          <Text style={styles.heroTitle}>{paperclip.headline}</Text>
          <Text style={styles.heroBody}>{paperclip.companySummary}</Text>

          <View style={styles.briefingGrid}>
            <View style={styles.briefingTile}>
              <Text style={styles.briefingLabel}>Top goal</Text>
              <Text style={styles.briefingTitle}>{paperclipSummary.topGoal?.title || 'No goal listed yet'}</Text>
              <Text style={styles.briefingMeta}>{paperclipSummary.topGoal?.status || 'Waiting for an update'}</Text>
            </View>
            <View style={styles.briefingTile}>
              <Text style={styles.briefingLabel}>Next task</Text>
              <Text style={styles.briefingTitle}>{paperclipSummary.nextTask?.title || 'No active task yet'}</Text>
              <Text style={styles.briefingMeta}>
                {paperclipSummary.nextTask?.owner ? `Owned by ${paperclipSummary.nextTask.owner}` : 'Owner not listed'}
              </Text>
            </View>
            <View style={styles.briefingTile}>
              <Text style={styles.briefingLabel}>Latest change</Text>
              <Text style={styles.briefingTitle}>{paperclipSummary.latestEvent?.title || 'No recent event yet'}</Text>
              <Text style={styles.briefingMeta}>
                {paperclipSummary.latestEvent ? formatRelativeTime(paperclipSummary.latestEvent.at) : 'Waiting for the first update'}
              </Text>
            </View>
            <View style={styles.briefingTile}>
              <Text style={styles.briefingLabel}>Team ready</Text>
              <Text style={styles.briefingTitle}>{paperclipSummary.readyCount}/{paperclip.roster.length}</Text>
              <Text style={styles.briefingMeta}>People ready to move right now</Text>
            </View>
          </View>

          <View style={styles.heroActions}>
            <Pressable
              style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
              onPress={() => setShowDashboard((current) => !current)}
            >
              <Text style={styles.primaryButtonText}>{showDashboard ? 'Hide larger view' : 'Open larger view'}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
              onPress={openBrowser}
            >
              <Text style={styles.secondaryButtonText}>Open in browser</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.focusCard}>
          <Text style={styles.focusEyebrow}>Look here next</Text>
          <Text style={styles.focusTitle}>{paperclipSummary.focusTitle}</Text>
          <Text style={styles.focusBody}>{paperclipSummary.focusBody}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Goals in motion</Text>
          <Text style={styles.sectionHint}>The bigger outcomes this agent is trying to move forward right now.</Text>
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
          <Text style={styles.sectionTitle}>Task board</Text>
          <Text style={styles.sectionHint}>The most immediate work, who owns it, and where it might need a decision.</Text>
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
                  <Text style={styles.metaText}>{task.owner ? `Owned by ${task.owner}` : 'Owner not listed'}</Text>
                  {task.note ? <Text style={styles.listBody}>{task.note}</Text> : null}
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Latest changes</Text>
          <Text style={styles.sectionHint}>What changed most recently, in the order you would want to read it on your phone.</Text>
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
          <Text style={styles.sectionHint}>Who is involved right now and who looks ready to move.</Text>
          <View style={styles.list}>
            {paperclip.roster.map((member) => {
              const tone = statusTone(member.status);
              return (
                <View key={member.id} style={styles.memberRow}>
                  <View style={styles.memberCopy}>
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
          <Animated.View style={[styles.card, dashboardAnimatedStyle]}>
            <Text style={styles.sectionTitle}>Larger view</Text>
            <Text style={styles.sectionHint}>Use the larger dashboard when you want the full picture instead of the phone-sized briefing.</Text>
            {Platform.OS === 'web' ? (
              <View style={styles.emptyPanel}>
                <Text style={styles.emptyPanelText}>Open the larger view in a browser from this device.</Text>
              </View>
            ) : dashboardFailed ? (
              <View style={styles.emptyPanel}>
                <Text style={styles.emptyPanelText}>The larger view could not load here. Open it in a browser instead.</Text>
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
                      <Text style={styles.loadingText}>Opening larger view…</Text>
                    </View>
                  )}
                />
              </View>
            )}
          </Animated.View>
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
  iconButtonPressed: {
    transform: [{ scale: 0.96 }],
    opacity: 0.92,
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
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  eyebrow: {
    color: BLUE,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontFamily: FONTS.body,
  },
  heroPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  heroPillText: {
    fontSize: 12,
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
  briefingGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  briefingTile: {
    width: '48.5%',
    backgroundColor: WHITE,
    borderRadius: 16,
    padding: 14,
    gap: 6,
  },
  briefingLabel: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    fontFamily: FONTS.body,
  },
  briefingTitle: {
    color: TEXT_PRIMARY,
    fontSize: 16,
    lineHeight: 22,
    fontFamily: FONTS.heading,
  },
  briefingMeta: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: FONTS.body,
  },
  heroActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 2,
  },
  focusCard: {
    backgroundColor: BLUE_WASH,
    borderRadius: 22,
    padding: 18,
    gap: 8,
  },
  focusEyebrow: {
    color: BLUE,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontFamily: FONTS.body,
  },
  focusTitle: {
    color: TEXT_PRIMARY,
    fontSize: 22,
    lineHeight: 28,
    fontFamily: FONTS.heading,
  },
  focusBody: {
    color: TEXT_PRIMARY,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONTS.body,
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
  memberCopy: {
    flex: 1,
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
  primaryButtonPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.94,
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
  secondaryButtonPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.94,
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
