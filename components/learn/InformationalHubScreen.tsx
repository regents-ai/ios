import { CoinbaseAlert } from '@/components/ui/CoinbaseAlerts';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import {
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type InformationalHubScreenProps = {
  title: string;
  intro: string;
  purposeTitle: string;
  purposeBody: string;
  whyItMatters: string[];
  websiteLabel: string;
  websiteUrl: string;
  resourceTitle: string;
  resourceBody: string;
  resourceLabel: string;
  resourceUrl: string;
};

export function InformationalHubScreen({
  title,
  intro,
  purposeTitle,
  purposeBody,
  whyItMatters,
  websiteLabel,
  websiteUrl,
  resourceTitle,
  resourceBody,
  resourceLabel,
  resourceUrl,
}: InformationalHubScreenProps) {
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);
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

  const openUrl = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch (error) {
      setAlertState({
        visible: true,
        title: 'Unable to open link',
        message: error instanceof Error ? error.message : 'Try again in a moment.',
        type: 'error',
      });
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.heroCard}>
          <Text style={styles.eyebrow}>Regents Mobile</Text>
          <Text style={styles.heroTitle}>{title}</Text>
          <Text style={styles.heroBody}>{intro}</Text>
          <View style={styles.heroActions}>
            <Pressable style={styles.primaryButton} onPress={() => openUrl(websiteUrl)}>
              <Text style={styles.primaryButtonText}>{websiteLabel}</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{purposeTitle}</Text>
          <Text style={styles.sectionBody}>{purposeBody}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Why it matters</Text>
          <View style={styles.reasonList}>
            {whyItMatters.map((item) => (
              <View key={item} style={styles.reasonRow}>
                <View style={styles.reasonDot} />
                <Text style={styles.reasonText}>{item}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{resourceTitle}</Text>
          <Text style={styles.sectionHint}>{resourceBody}</Text>
          <Pressable style={styles.secondaryButton} onPress={() => openUrl(resourceUrl)}>
            <Ionicons name="open-outline" size={16} color={colors.text} />
            <Text style={styles.secondaryButtonText}>{resourceLabel}</Text>
          </Pressable>
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

function makeStyles({ colors, fonts }: Theme) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 20,
    gap: 16,
  },
  heroCard: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    borderRadius: 24,
    padding: 22,
    gap: 12,
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
    lineHeight: 34,
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
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    borderRadius: 22,
    padding: 18,
    gap: 14,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 22,
    fontFamily: fonts.title,
  },
  sectionBody: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.ui,
  },
  sectionHint: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: -4,
    fontFamily: fonts.ui,
  },
  reasonList: {
    gap: 12,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  reasonDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
    marginTop: 7,
  },
  reasonText: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.ui,
  },
  commandCard: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 18,
    padding: 16,
    gap: 10,
  },
  commandLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontFamily: fonts.ui,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  commandText: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 22,
    fontFamily: fonts.title,
  },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: colors.onAccent,
    fontSize: 14,
    fontFamily: fonts.ui,
  },
  secondaryButton: {
    backgroundColor: colors.accentWash,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: 14,
    fontFamily: fonts.ui,
  },
  });
}
