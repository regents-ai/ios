import { useTheme, type Theme } from '@/theme/ThemeProvider';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

const BUY_STEPS = [
  'Open the current launch page in Autolaunch.',
  'Read the story, momentum, and price before you buy.',
  'Come back here when you want to check the next one.',
];

export default function AutolaunchTab() {
  const router = useRouter();
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);

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
            <Ionicons name="sparkles-outline" size={18} color={colors.accent} />
            <View style={styles.featureCopy}>
              <Text style={styles.featureTitle}>Keep the story short</Text>
              <Text style={styles.featureBody}>
                Autolaunch works best when the reason to believe is clear in a few lines.
              </Text>
            </View>
          </View>

          <View style={styles.featureCard}>
            <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.accent} />
            <View style={styles.featureCopy}>
              <Text style={styles.featureTitle}>Agent Brief first</Text>
              <Text style={styles.featureBody}>
                Use Agent Brief to understand what an agent team is building before you buy, then come back to track what you hold.
              </Text>
            </View>
          </View>

          <View style={styles.featureCard}>
            <Ionicons name="wallet-outline" size={18} color={colors.accent} />
            <View style={styles.featureCopy}>
              <Text style={styles.featureTitle}>Wallet stays close</Text>
              <Text style={styles.featureBody}>
                Funding and payments stay nearby, so you can move quickly without a crowded app.
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
          worth opening, not bury you in a trading screen.
        </Text>
      </View>
    </ScrollView>
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
    flexWrap: 'wrap',
    gap: 10,
  },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 13,
  },
  primaryButtonPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
  primaryButtonText: {
    color: colors.onAccent,
    fontSize: 14,
    fontFamily: fonts.ui,
  },
  secondaryButton: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
  },
  secondaryButtonPressed: {
    opacity: 0.95,
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: 14,
    fontFamily: fonts.ui,
  },
  card: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    borderRadius: 24,
    padding: 20,
    gap: 14,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 22,
    fontFamily: fonts.title,
  },
  featureList: {
    gap: 10,
  },
  featureCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 16,
  },
  featureCopy: {
    flex: 1,
    gap: 4,
  },
  featureTitle: {
    color: colors.text,
    fontSize: 16,
    fontFamily: fonts.title,
  },
  featureBody: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: fonts.ui,
  },
  steps: {
    gap: 10,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 18,
    padding: 14,
  },
  stepBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.accentWash,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBadgeText: {
    color: colors.accent,
    fontSize: 12,
    fontFamily: fonts.title,
  },
  stepText: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.ui,
  },
  noteCard: {
    backgroundColor: colors.accentWash,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    borderRadius: 24,
    padding: 20,
    gap: 8,
  },
  noteTitle: {
    color: colors.text,
    fontSize: 22,
    fontFamily: fonts.title,
  },
  noteBody: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.ui,
  },
  });
}
