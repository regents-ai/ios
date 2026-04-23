import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

const { DARK_BG, CARD_BG, CARD_ALT, TEXT_PRIMARY, TEXT_SECONDARY, BLUE, BORDER, WHITE, BLUE_WASH } = COLORS;

const BUY_STEPS = [
  'Open the current launch page in Autolaunch.',
  'Read the story, momentum, and price before you buy.',
  'Come back here when you want to check the next one.',
];

export default function AutolaunchTab() {
  const router = useRouter();

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      style={styles.container}
    >
      <View style={styles.heroCard}>
        <Text style={styles.eyebrow}>Buy</Text>
        <Text style={styles.heroTitle}>Back promising agents on Autolaunch</Text>
        <Text style={styles.heroBody}>
          When a team is ready for outside support, this is the handoff. Open the launch page, decide
          if you want in, and come back to keep following the story.
        </Text>

        <View style={styles.heroActions}>
          <Pressable
            onPress={() => Linking.openURL('https://autolaunch.sh')}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
          >
            <Text style={styles.primaryButtonText}>Open Autolaunch</Text>
          </Pressable>

          <Pressable
            onPress={() => router.push('/agents')}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
          >
            <Text style={styles.secondaryButtonText}>Back to Regents</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>How this fits</Text>
        <View style={styles.featureList}>
          <View style={styles.featureCard}>
            <Ionicons name="sparkles-outline" size={18} color={BLUE} />
            <View style={styles.featureCopy}>
              <Text style={styles.featureTitle}>Keep the story short</Text>
              <Text style={styles.featureBody}>
                Autolaunch works best when the reason to believe is clear in a few lines.
              </Text>
            </View>
          </View>

          <View style={styles.featureCard}>
            <Ionicons name="chatbubble-ellipses-outline" size={18} color={BLUE} />
            <View style={styles.featureCopy}>
              <Text style={styles.featureTitle}>Talk first, buy second</Text>
              <Text style={styles.featureBody}>
                Use Talk and Regent Manager to understand what a Regents team is building before you buy, then come back to track what you hold.
              </Text>
            </View>
          </View>

          <View style={styles.featureCard}>
            <Ionicons name="wallet-outline" size={18} color={BLUE} />
            <View style={styles.featureCopy}>
              <Text style={styles.featureTitle}>Wallet stays close</Text>
              <Text style={styles.featureBody}>
                Funding and money movement stay nearby, so you can move quickly without a crowded app.
              </Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>What you will do</Text>
        <View style={styles.steps}>
          {BUY_STEPS.map((step, index) => (
            <View key={step} style={styles.stepRow}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>{index + 1}</Text>
              </View>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.noteCard}>
        <Text style={styles.noteTitle}>Keep it light</Text>
        <Text style={styles.noteBody}>
          This screen is only for the handoff. The rest of the app should help you decide what is
          worth opening, not bury you in a trading terminal.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DARK_BG,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 120,
    gap: 16,
  },
  heroCard: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 28,
    padding: 22,
    gap: 14,
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
    fontSize: 32,
    lineHeight: 38,
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
  primaryButton: {
    backgroundColor: BLUE,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 13,
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
  secondaryButton: {
    backgroundColor: WHITE,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: BORDER,
  },
  secondaryButtonPressed: {
    opacity: 0.95,
  },
  secondaryButtonText: {
    color: TEXT_PRIMARY,
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
  featureList: {
    gap: 10,
  },
  featureCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: CARD_ALT,
    borderRadius: 18,
    padding: 16,
  },
  featureCopy: {
    flex: 1,
    gap: 4,
  },
  featureTitle: {
    color: TEXT_PRIMARY,
    fontSize: 16,
    fontFamily: FONTS.heading,
  },
  featureBody: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: FONTS.body,
  },
  steps: {
    gap: 10,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: WHITE,
    borderRadius: 18,
    padding: 14,
  },
  stepBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: BLUE_WASH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBadgeText: {
    color: BLUE,
    fontSize: 12,
    fontFamily: FONTS.heading,
  },
  stepText: {
    flex: 1,
    color: TEXT_PRIMARY,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONTS.body,
  },
  noteCard: {
    backgroundColor: BLUE_WASH,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 24,
    padding: 20,
    gap: 8,
  },
  noteTitle: {
    color: TEXT_PRIMARY,
    fontSize: 22,
    fontFamily: FONTS.heading,
  },
  noteBody: {
    color: TEXT_PRIMARY,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONTS.body,
  },
});
