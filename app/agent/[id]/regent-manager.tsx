import { StatusPill } from '@/components/agent-surfaces/StatusPill';
import { LiveValueFlash } from '@/components/motion/LiveValueFlash';
import { SpinningRefreshIcon } from '@/components/motion/SpinningRefreshIcon';
import { CoinbaseAlert } from '@/components/ui/CoinbaseAlerts';
import { RegentPressable } from '@/components/ui/RegentPressable';
import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import { RegentManagerDetail } from '@/types/regents';
import { formatRelativeTime } from '@/utils/agent-surfaces/formatters';
import { regentApi } from '@/utils/regentApi/client';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const { DARK_BG, CARD_BG, TEXT_PRIMARY, TEXT_SECONDARY, BLUE, BORDER, WHITE, SUCCESS, DANGER } = COLORS;

const AMBER = '#A3703A';
const AMBER_WASH = '#F2E7DA';
const GREEN_WASH = '#E6F0EA';
const RED_WASH = '#F3E1DD';
const BLUE_WASH = '#E7EEF2';

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

function isMovingStatus(status: string) {
  const lower = status.toLowerCase();
  return lower.includes('track') || lower.includes('online') || lower.includes('ready') || lower.includes('running');
}

function readyRosterCount(regentManager: RegentManagerDetail | null) {
  if (!regentManager) {
    return 0;
  }

  return regentManager.roster.filter((member) => {
    const lower = member.status.toLowerCase();
    return lower.includes('ready') || lower.includes('online') || lower.includes('track');
  }).length;
}

export default function AgentRegentManagerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const agentId = typeof params.id === 'string' ? params.id : '';
  const [regentManager, setRegentManager] = useState<RegentManagerDetail | null>(null);
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

  const loadRegentManager = useCallback(async (refresh = false) => {
    if (!agentId) {
      return;
    }

    try {
      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setRegentManager(await regentApi.getRegentManager(agentId));
    } catch (error) {
      setAlertState({
        visible: true,
        title: 'Agent Brief is unavailable right now',
        message: error instanceof Error ? error.message : 'Try again in a moment.',
        type: 'error',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [agentId]);

  useFocusEffect(
    useCallback(() => {
      loadRegentManager();
    }, [loadRegentManager])
  );

  const regentManagerSummary = useMemo(() => {
    if (!regentManager) {
      return null;
    }

    const topGoal = regentManager.goals[0];
    const nextTask = regentManager.activeTasks[0];
    const latestEvent = regentManager.recentEvents[0];
    const readyCount = readyRosterCount(regentManager);
    const attentionItem = [...regentManager.goals, ...regentManager.activeTasks].find((item) => {
      const lower = item.status.toLowerCase();
      return lower.includes('attention') || lower.includes('waiting') || lower.includes('blocked');
    });

    return {
      topGoal,
      nextTask,
      latestEvent,
      readyCount,
      briefingLabel: attentionItem ? 'Needs review' : 'Steady',
      briefingTone: attentionItem ? { wash: AMBER_WASH, accent: AMBER } : { wash: GREEN_WASH, accent: SUCCESS },
      focusTitle: attentionItem?.title || nextTask?.title || topGoal?.title || 'No immediate issue listed',
      focusBody: attentionItem?.note || nextTask?.note || topGoal?.note || 'A short company brief will appear here when it is ready.',
    };
  }, [regentManager]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={BLUE} />
          <Text style={styles.loadingText}>Loading Agent Brief...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!regentManager || !regentManagerSummary) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerState}>
          <Text style={styles.emptyTitle}>Agent Brief is unavailable</Text>
          <RegentPressable style={styles.primaryButton} onPress={() => router.back()}>
            <Text style={styles.primaryButtonText}>Back</Text>
          </RegentPressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <RegentPressable pressStyle="icon" onPress={() => router.back()} style={styles.iconButton}>
          <Ionicons name="chevron-back" size={22} color={TEXT_PRIMARY} />
        </RegentPressable>
        <Text style={styles.headerTitle}>Agent Brief</Text>
        <RegentPressable pressStyle="icon" onPress={() => loadRegentManager(true)} disabled={refreshing} style={styles.iconButton}>
          <SpinningRefreshIcon refreshing={refreshing} size={18} color={BLUE} />
        </RegentPressable>
      </View>

      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.scrollContent}>
        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <Text style={styles.eyebrow}>Agent brief</Text>
            <View style={[styles.heroPill, { backgroundColor: regentManagerSummary.briefingTone.wash }]}>
              <Text style={[styles.heroPillText, { color: regentManagerSummary.briefingTone.accent }]}>
                {regentManagerSummary.briefingLabel}
              </Text>
            </View>
          </View>
          <Text style={styles.heroTitle}>{regentManager.headline}</Text>
          <Text style={styles.heroBody}>{regentManager.companySummary}</Text>

          <View style={styles.briefingGrid}>
            <View style={styles.briefingTile}>
              <Text style={styles.briefingLabel}>Focus now</Text>
              <LiveValueFlash value={`briefing-focus-${regentManagerSummary.focusTitle}`}>
                <Text style={styles.briefingTitle} numberOfLines={2}>{regentManagerSummary.focusTitle}</Text>
              </LiveValueFlash>
              <Text style={styles.briefingMeta}>Immediate read</Text>
            </View>
            <View style={styles.briefingTile}>
              <Text style={styles.briefingLabel}>Latest shift</Text>
              <LiveValueFlash value={`briefing-latest-${regentManagerSummary.latestEvent?.title || 'No recent change yet'}`}>
                <Text style={styles.briefingTitle} numberOfLines={2}>{regentManagerSummary.latestEvent?.title || 'No recent change yet'}</Text>
              </LiveValueFlash>
              <Text style={styles.briefingMeta}>
                {regentManagerSummary.latestEvent ? formatRelativeTime(regentManagerSummary.latestEvent.at) : 'Waiting for the next update'}
              </Text>
            </View>
            <View style={styles.briefingTile}>
              <Text style={styles.briefingLabel}>Top goal</Text>
              <LiveValueFlash value={`briefing-goal-${regentManagerSummary.topGoal?.title || 'No goal listed yet'}`}>
                <Text style={styles.briefingTitle} numberOfLines={2}>{regentManagerSummary.topGoal?.title || 'No goal listed yet'}</Text>
              </LiveValueFlash>
              <Text style={styles.briefingMeta}>{regentManagerSummary.topGoal?.status || 'No status yet'}</Text>
            </View>
            <View style={styles.briefingTile}>
              <Text style={styles.briefingLabel}>Team ready</Text>
              <LiveValueFlash value={`briefing-ready-${regentManagerSummary.readyCount}/${regentManager.roster.length}`}>
                <Text style={styles.briefingTitle}>{regentManagerSummary.readyCount}/{regentManager.roster.length}</Text>
              </LiveValueFlash>
              <Text style={styles.briefingMeta}>Ready to move now</Text>
            </View>
          </View>
        </View>

        <View style={styles.focusCard}>
          <Text style={styles.focusEyebrow}>What needs attention</Text>
          <Text style={styles.focusTitle}>{regentManagerSummary.focusTitle}</Text>
          <Text style={styles.focusBody} numberOfLines={4}>{regentManagerSummary.focusBody}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Current work</Text>
          <Text style={styles.sectionHint}>The goal and task that should frame the next decision.</Text>
          <View style={styles.list}>
            {regentManagerSummary.topGoal ? (
              <View style={styles.listCard}>
                <View style={styles.listHeader}>
                  <Text style={styles.listTitle} numberOfLines={2}>{regentManagerSummary.topGoal.title}</Text>
                  <StatusPill
                    label={regentManagerSummary.topGoal.status}
                    color={statusTone(regentManagerSummary.topGoal.status).color}
                    backgroundColor={statusTone(regentManagerSummary.topGoal.status).backgroundColor}
                    compact
                    showDot={isMovingStatus(regentManagerSummary.topGoal.status)}
                  />
                </View>
                {regentManagerSummary.topGoal.note ? <Text style={styles.listBody} numberOfLines={3}>{regentManagerSummary.topGoal.note}</Text> : null}
              </View>
            ) : null}

            {regentManager.activeTasks.slice(0, 3).map((task) => {
              const tone = statusTone(task.status);
              return (
                <View key={task.id} style={styles.listCard}>
                  <View style={styles.listHeader}>
                    <Text style={styles.listTitle} numberOfLines={2}>{task.title}</Text>
                    <StatusPill label={task.status} color={tone.color} backgroundColor={tone.backgroundColor} compact showDot={isMovingStatus(task.status)} />
                  </View>
                  <Text style={styles.metaText}>{task.owner ? `Led by ${task.owner}` : 'Lead not listed'}</Text>
                  {task.note ? <Text style={styles.listBody} numberOfLines={3}>{task.note}</Text> : null}
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Recent movement</Text>
          <Text style={styles.sectionHint}>The latest changes shaping the company view.</Text>
          <View style={styles.list}>
            {regentManager.recentEvents.slice(0, 4).map((event) => (
              <View key={event.id} style={styles.listCard}>
                <Text style={styles.listTitle} numberOfLines={2}>{event.title}</Text>
                <Text style={styles.metaText}>{new Date(event.at).toLocaleString()}</Text>
                <Text style={styles.listBody} numberOfLines={3}>{event.detail}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Team</Text>
          <Text style={styles.sectionHint}>Who is carrying the work right now.</Text>
          <View style={styles.list}>
            {regentManager.roster.map((member) => {
              const tone = statusTone(member.status);
              return (
                <View key={member.id} style={styles.memberRow}>
                  <View style={styles.memberCopy}>
                    <Text style={styles.memberName}>{member.name}</Text>
                    <Text style={styles.memberRole}>{member.role}</Text>
                  </View>
                  <StatusPill label={member.status} color={tone.color} backgroundColor={tone.backgroundColor} compact showDot={isMovingStatus(member.status)} />
                </View>
              );
            })}
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
  headerTitle: {
    flex: 1,
    minWidth: 0,
    color: TEXT_PRIMARY,
    fontSize: 20,
    lineHeight: 24,
    textAlign: 'center',
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
    flexWrap: 'wrap',
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
    flexBasis: '47%',
    flexGrow: 1,
    minWidth: 142,
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
    minWidth: 120,
    backgroundColor: BLUE,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
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
    flexWrap: 'wrap',
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
  memberRow: {
    backgroundColor: WHITE,
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
  },
  memberCopy: {
    flex: 1,
    minWidth: 0,
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
});
