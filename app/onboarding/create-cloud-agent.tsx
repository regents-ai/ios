/**
 * Path 2: create an agent in Regents Cloud.
 *
 * TODO(sean-decision): the cloud agent-creation flow (payment connector +
 * creation steps and any backend contract behind them) is not designed yet.
 * This screen explains the path and routes the one concrete step that exists
 * today — adding funds — to the existing onramp (Fund tab). No backend
 * contract is invented here.
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { RegentPressable } from '@/components/ui/RegentPressable';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { setPostAuthDestination } from '@/utils/state/postAuthDestination';

const STEPS = [
  { icon: 'cash-outline', title: 'Add funds', detail: 'Load USDC with Apple Pay or your card.' },
  { icon: 'card-outline', title: 'Connect a payment method', detail: 'So your agent can pay for what it uses.' },
  { icon: 'rocket-outline', title: 'Launch your agent', detail: 'Your agent runs in Regents Cloud, ready anywhere.' },
] as const;

export default function CreateCloudAgentScreen() {
  const router = useRouter();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { colors } = theme;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <RegentPressable pressStyle="icon" onPress={() => router.back()} style={styles.iconButton}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </RegentPressable>
        <Text style={styles.headerTitle}>Create a cloud agent</Text>
        <View style={styles.iconButton} />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>
          No agent yet? Regents Cloud runs one for you. Here is how it will work:
        </Text>

        <View style={styles.stepsCard}>
          {STEPS.map((step, index) => (
            <View key={step.title}>
              <View style={styles.stepRow}>
                <View style={styles.stepIcon}>
                  <Ionicons name={step.icon} size={20} color={colors.accent} />
                </View>
                <View style={styles.stepCopy}>
                  <Text style={styles.stepTitle}>{step.title}</Text>
                  <Text style={styles.stepDetail}>{step.detail}</Text>
                </View>
              </View>
              {index < STEPS.length - 1 ? <View style={styles.stepDivider} /> : null}
            </View>
          ))}
        </View>

        <Text style={styles.comingSoon}>
          Cloud agent creation opens soon. You can add funds now so you are ready on day one.
        </Text>

        <RegentPressable
          style={styles.primaryButton}
          onPress={() => {
            // Adding funds is the chosen next step now, even if sign-in comes first.
            setPostAuthDestination('/(tabs)/wallet');
            router.replace('/(tabs)/wallet');
          }}
        >
          <Text style={styles.primaryButtonText}>Add funds to get ready</Text>
        </RegentPressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles({ colors, fonts, type, space, radius }: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: space.s5,
      paddingTop: space.s3,
      paddingBottom: space.s2,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.hairline,
    },
    iconButton: {
      width: 40,
      height: 40,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: { color: colors.text, fontSize: type.headline.size, fontFamily: fonts.title },
    body: { paddingHorizontal: space.s5, paddingVertical: space.s4, gap: space.s4 },
    intro: {
      color: colors.textMuted,
      fontSize: type.label.size,
      lineHeight: type.label.line,
      fontFamily: fonts.ui,
    },
    stepsCard: {
      backgroundColor: colors.surfaceElevated,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.hairlineStrong,
      borderRadius: radius.lg,
      padding: space.s4,
    },
    stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.s3, paddingVertical: space.s2 },
    stepIcon: {
      width: 36,
      height: 36,
      borderRadius: radius.md,
      backgroundColor: colors.accentWash,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepCopy: { flex: 1, minWidth: 0, gap: 2 },
    stepTitle: { color: colors.text, fontSize: type.body.size, fontFamily: fonts.title },
    stepDetail: {
      color: colors.textMuted,
      fontSize: type.label.size,
      lineHeight: type.label.line,
      fontFamily: fonts.ui,
    },
    stepDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.hairline,
      marginLeft: 48,
    },
    comingSoon: {
      color: colors.textMuted,
      fontSize: type.label.size,
      lineHeight: type.label.line,
      fontFamily: fonts.ui,
    },
    primaryButton: {
      backgroundColor: colors.accent,
      borderRadius: radius.md,
      paddingVertical: space.s3,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryButtonText: { color: colors.onAccent, fontSize: type.label.size, fontFamily: fonts.ui },
  });
}
