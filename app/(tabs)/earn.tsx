import { ProfileButton } from '@/components/navigation/ProfileButton';
import { RegentPressable } from '@/components/ui/RegentPressable';
import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import { routes } from '@/utils/navigation/routes';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { Linking, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

const { DARK_BG, CARD_BG, CARD_ALT, TEXT_PRIMARY, TEXT_SECONDARY, BLUE, BORDER, WHITE, BLUE_WASH, SUCCESS } = COLORS;

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
            <Ionicons name="sparkles-outline" size={22} color={BLUE} />
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
                <Ionicons name={path.icon} size={19} color={BLUE} />
              </View>
              <View style={styles.pathCopy}>
                <Text style={styles.pathTitle}>{path.title}</Text>
                <Text style={styles.pathBody}>{path.body}</Text>
                <Text style={styles.pathAction}>{path.action}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={TEXT_SECONDARY} />
            </RegentPressable>
          ))}
        </View>

        <View style={styles.noteCard}>
          <View style={styles.noteBadge}>
            <Ionicons name="checkmark-circle-outline" size={16} color={SUCCESS} />
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DARK_BG,
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
    color: BLUE,
    fontSize: 12,
    textTransform: 'uppercase',
    fontFamily: FONTS.body,
  },
  title: {
    color: TEXT_PRIMARY,
    fontSize: 32,
    lineHeight: 38,
    fontFamily: FONTS.heading,
  },
  subtitle: {
    color: TEXT_SECONDARY,
    fontSize: 15,
    lineHeight: 21,
    fontFamily: FONTS.body,
  },
  heroCard: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 24,
    padding: 20,
    gap: 13,
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: BLUE_WASH,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    color: TEXT_PRIMARY,
    fontSize: 24,
    lineHeight: 29,
    fontFamily: FONTS.heading,
  },
  heroBody: {
    color: TEXT_SECONDARY,
    fontSize: 14,
    lineHeight: 21,
    fontFamily: FONTS.body,
  },
  heroActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  primaryButton: {
    backgroundColor: BLUE,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 13,
  },
  primaryButtonText: {
    color: WHITE,
    fontSize: 14,
    fontFamily: FONTS.body,
  },
  secondaryButton: {
    backgroundColor: WHITE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 18,
    paddingVertical: 13,
  },
  secondaryButtonText: {
    color: TEXT_PRIMARY,
    fontSize: 14,
    fontFamily: FONTS.body,
  },
  pathList: {
    gap: 12,
  },
  pathCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 20,
    padding: 16,
  },
  pathIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: CARD_ALT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pathCopy: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  pathTitle: {
    color: TEXT_PRIMARY,
    fontSize: 18,
    lineHeight: 22,
    fontFamily: FONTS.heading,
  },
  pathBody: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: FONTS.body,
  },
  pathAction: {
    color: BLUE,
    fontSize: 13,
    fontFamily: FONTS.body,
  },
  noteCard: {
    backgroundColor: BLUE_WASH,
    borderWidth: 1,
    borderColor: BORDER,
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
    color: TEXT_PRIMARY,
    fontSize: 14,
    fontFamily: FONTS.heading,
  },
  noteText: {
    color: TEXT_SECONDARY,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONTS.body,
  },
});
