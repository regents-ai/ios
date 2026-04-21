import { CoinbaseAlert } from '@/components/ui/CoinbaseAlerts';
import { PreviewNotice } from '@/components/ui/PreviewNotice';
import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import { PreviewPaperclipDetail } from '@/types/agentPreviews';
import { fetchPreviewPaperclip } from '@/utils/fetchPreviewPaperclip';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const { DARK_BG, CARD_BG, TEXT_PRIMARY, TEXT_SECONDARY, BLUE, BORDER, WHITE, BLUE_WASH, SUCCESS, DANGER } = COLORS;

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

function readyRosterCount(paperclip: PreviewPaperclipDetail | null) {
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
  const [paperclip, setPaperclip] = useState<PreviewPaperclipDetail | null>(null);
  const [loading, setLoading] = useState(true);
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
      setPaperclip(await fetchPreviewPaperclip(agentId));
    } catch (error) {
      setAlertState({
        visible: true,
        title: 'Unable to load this preview',
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
      briefingLabel: attentionItem ? 'Review example' : 'Steady example',
      briefingTone: attentionItem ? { wash: AMBER_WASH, accent: AMBER } : { wash: GREEN_WASH, accent: SUCCESS },
      focusTitle: attentionItem?.title || nextTask?.title || topGoal?.title || 'No immediate issue listed',
      focusBody: attentionItem?.note || nextTask?.note || topGoal?.note || 'The latest preview note will appear here when available.',
    };
  }, [paperclip]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={BLUE} />
          <Text style={styles.loadingText}>Loading Paperclip preview…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!paperclip || !paperclipSummary) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerState}>
          <Text style={styles.emptyTitle}>This preview is unavailable</Text>
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
            <Text style={styles.eyebrow}>Paperclip preview</Text>
            <View style={[styles.heroPill, { backgroundColor: paperclipSummary.briefingTone.wash }]}>
              <Text style={[styles.heroPillText, { color: paperclipSummary.briefingTone.accent }]}>
                {paperclipSummary.briefingLabel}
              </Text>
            </View>
          </View>
          <Text style={styles.heroTitle}>{paperclip.headline}</Text>
          <Text style={styles.heroBody}>{paperclip.companySummary}</Text>
          <PreviewNotice body="This is a sample Paperclip view. It shows how a phone-sized company summary may look later, but it does not open a live dashboard in this build." />

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
        </View>

        <View style={styles.focusCard}>
          <Text style={styles.focusEyebrow}>Look here next</Text>
          <Text style={styles.focusTitle}>{paperclipSummary.focusTitle}</Text>
          <Text style={styles.focusBody}>{paperclipSummary.focusBody}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Goals in motion</Text>
          <Text style={styles.sectionHint}>The larger outcomes this sample company is trying to move forward.</Text>
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
          <Text style={styles.sectionHint}>The immediate work, who owns it, and where attention could be needed later.</Text>
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
          <Text style={styles.sectionHint}>What changed most recently in this sample summary.</Text>
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
          <Text style={styles.sectionHint}>Who is involved in this sample company view right now.</Text>
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

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Larger view</Text>
          <Text style={styles.sectionHint}>The browser-sized dashboard stays off in this preview pass.</Text>
          <View style={styles.emptyPanel}>
            <Text style={styles.emptyPanelText}>This screen stays on the phone-sized summary only. Opening a larger dashboard comes later with the live Regent connection.</Text>
          </View>
        </View>
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
    fontSize: 11,
    textTransform: 'uppercase',
    fontFamily: FONTS.body,
  },
  briefingTitle: {
    color: TEXT_PRIMARY,
    fontSize: 16,
    lineHeight: 21,
    fontFamily: FONTS.heading,
  },
  briefingMeta: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: FONTS.body,
  },
  focusCard: {
    backgroundColor: BLUE_WASH,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 24,
    padding: 20,
    gap: 8,
  },
  focusEyebrow: {
    color: BLUE,
    fontSize: 12,
    textTransform: 'uppercase',
    fontFamily: FONTS.body,
  },
  focusTitle: {
    color: TEXT_PRIMARY,
    fontSize: 24,
    fontFamily: FONTS.heading,
  },
  focusBody: {
    color: TEXT_PRIMARY,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONTS.body,
  },
  primaryButton: {
    backgroundColor: BLUE,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
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
  card: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 24,
    padding: 20,
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
    lineHeight: 19,
    fontFamily: FONTS.body,
  },
  list: {
    gap: 10,
  },
  listCard: {
    backgroundColor: WHITE,
    borderRadius: 16,
    padding: 14,
    gap: 8,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    alignItems: 'flex-start',
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
    fontSize: 13,
    lineHeight: 19,
    fontFamily: FONTS.body,
  },
  metaText: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    fontFamily: FONTS.body,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusPillText: {
    fontSize: 11,
    fontFamily: FONTS.body,
  },
  memberRow: {
    backgroundColor: WHITE,
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  memberCopy: {
    flex: 1,
    gap: 3,
  },
  memberName: {
    color: TEXT_PRIMARY,
    fontSize: 15,
    fontFamily: FONTS.heading,
  },
  memberRole: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    fontFamily: FONTS.body,
  },
  emptyPanel: {
    backgroundColor: WHITE,
    borderRadius: 16,
    padding: 14,
  },
  emptyPanelText: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: FONTS.body,
  },
});
