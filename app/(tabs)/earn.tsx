import { ProfileButton } from '@/components/navigation/ProfileButton';
import { RegentPressable } from '@/components/ui/RegentPressable';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { routes } from '@/utils/navigation/routes';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Linking, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

const EARN_PATHS = [
  {
    title: 'Bring in a builder',
    body: 'Show a team how to fund an agent working balance and pay for real work.',
    icon: 'people-outline',
    action: 'Open Regents',
    route: '/agents' as const,
  },
  {
    title: 'Grow Techtree',
    body: 'Turn useful agent research into a shared path others can build on.',
    icon: 'git-branch-outline',
    action: 'Open Techtree',
    route: '/techtree' as const,
  },
  {
    title: 'Back launches',
    body: 'Follow new agent companies as they move from story to outside support.',
    icon: 'rocket-outline',
    action: 'Open Autolaunch',
    route: '/autolaunch' as const,
  },
] as const;

export default function EarnTab() {
  const router = useRouter();
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scroller}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
      >
        <View style={styles.header}>
          <View style={styles.titleGroup}>
            <Text style={styles.eyebrow}>Earn</Text>
            <Text style={styles.title}>Bring people into Regents</Text>
            <Text style={styles.subtitle}>
              Help people fund agents, publish what agents learn, and find launches worth backing.
            </Text>
          </View>
          <ProfileButton />
        </View>

        <View style={styles.heroCard}>
          <View style={styles.heroIcon}>
            <Ionicons name="sparkles-outline" size={22} color={colors.accent} />
          </View>
          <Text style={styles.heroTitle}>Earn by growing the agent network</Text>
          <Text style={styles.heroBody}>
            Regents, Techtree, and Autolaunch work together: fund agent work, turn the work into durable knowledge, then help promising agents find their first believers.
          </Text>
          <View style={styles.heroActions}>
            <RegentPressable style={styles.primaryButton} onPress={() => router.push(routes.staking())}>
              <Text style={styles.primaryButtonText}>Track rewards</Text>
            </RegentPressable>
            <RegentPressable style={styles.secondaryButton} onPress={() => Linking.openURL('https://regents.sh')}>
              <Text style={styles.secondaryButtonText}>Open regents.sh</Text>
            </RegentPressable>
          </View>
        </View>

        <View style={styles.pathList}>
          {EARN_PATHS.map((path) => (
            <RegentPressable
              key={path.title}
              pressStyle="card"
              style={styles.pathCard}
              onPress={() => router.push(path.route)}
            >
              <View style={styles.pathIcon}>
                <Ionicons name={path.icon} size={19} color={colors.accent} />
              </View>
              <View style={styles.pathCopy}>
                <Text style={styles.pathTitle}>{path.title}</Text>
                <Text style={styles.pathBody}>{path.body}</Text>
                <Text style={styles.pathAction}>{path.action}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </RegentPressable>
          ))}
        </View>

        <View style={styles.noteCard}>
          <View style={styles.noteBadge}>
            <Ionicons name="checkmark-circle-outline" size={16} color={colors.success} />
            <Text style={styles.noteBadgeText}>Keep it useful</Text>
          </View>
          <Text style={styles.noteText}>
            The strongest invite is simple: help someone give an agent a working balance, get a result, and share what changed.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles({ colors, fonts }: Theme) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scroller: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 120,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    paddingTop: 8,
  },
  titleGroup: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  eyebrow: {
    color: colors.accent,
    fontSize: 12,
    textTransform: 'uppercase',
    fontFamily: fonts.ui,
  },
  title: {
    color: colors.text,
    fontSize: 32,
    lineHeight: 38,
    fontFamily: fonts.title,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 21,
    fontFamily: fonts.ui,
  },
  heroCard: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    borderRadius: 24,
    padding: 20,
    gap: 13,
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accentWash,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    color: colors.text,
    fontSize: 24,
    lineHeight: 29,
    fontFamily: fonts.title,
  },
  heroBody: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
    fontFamily: fonts.ui,
  },
  heroActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 13,
  },
  primaryButtonText: {
    color: colors.onAccent,
    fontSize: 14,
    fontFamily: fonts.ui,
  },
  secondaryButton: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    paddingHorizontal: 18,
    paddingVertical: 13,
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: 14,
    fontFamily: fonts.ui,
  },
  pathList: {
    gap: 12,
  },
  pathCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    borderRadius: 20,
    padding: 16,
  },
  pathIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pathCopy: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  pathTitle: {
    color: colors.text,
    fontSize: 18,
    lineHeight: 22,
    fontFamily: fonts.title,
  },
  pathBody: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: fonts.ui,
  },
  pathAction: {
    color: colors.accent,
    fontSize: 13,
    fontFamily: fonts.ui,
  },
  noteCard: {
    backgroundColor: colors.accentWash,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    borderRadius: 20,
    padding: 16,
    gap: 9,
  },
  noteBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  noteBadgeText: {
    color: colors.text,
    fontSize: 14,
    fontFamily: fonts.title,
  },
  noteText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.ui,
  },
  });
}
