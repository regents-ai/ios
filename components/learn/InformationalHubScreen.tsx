import { CoinbaseAlert } from '@/components/ui/CoinbaseAlerts';
import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import * as Clipboard from 'expo-clipboard';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import {
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const { DARK_BG, CARD_BG, CARD_ALT, TEXT_PRIMARY, TEXT_SECONDARY, BLUE, BORDER, WHITE, BLUE_WASH } = COLORS;

type InformationalHubScreenProps = {
  title: string;
  intro: string;
  purposeTitle: string;
  purposeBody: string;
  whyItMatters: string[];
  websiteLabel: string;
  websiteUrl: string;
  cliInstallCommand: string;
  cliStartCommand: string;
  cliTitle: string;
};

export function InformationalHubScreen({
  title,
  intro,
  purposeTitle,
  purposeBody,
  whyItMatters,
  websiteLabel,
  websiteUrl,
  cliInstallCommand,
  cliStartCommand,
  cliTitle,
}: InformationalHubScreenProps) {
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

  const openWebsite = async () => {
    try {
      await Linking.openURL(websiteUrl);
    } catch (error) {
      setAlertState({
        visible: true,
        title: 'Unable to open website',
        message: error instanceof Error ? error.message : 'Try again in a moment.',
        type: 'error',
      });
    }
  };

  const copyCommand = async (label: string, command: string) => {
    try {
      await Clipboard.setStringAsync(command);
      setAlertState({
        visible: true,
        title: 'Copied',
        message: `${label} is ready to paste.`,
        type: 'success',
      });
    } catch (error) {
      setAlertState({
        visible: true,
        title: 'Unable to copy command',
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
            <Pressable style={styles.primaryButton} onPress={openWebsite}>
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
          <Text style={styles.sectionTitle}>{cliTitle}</Text>
          <Text style={styles.sectionHint}>Start from the command line when you want the full experience.</Text>

          <View style={styles.commandCard}>
            <Text style={styles.commandLabel}>Install the CLI</Text>
            <Text style={styles.commandText}>{cliInstallCommand}</Text>
            <Pressable style={styles.secondaryButton} onPress={() => copyCommand('The install command', cliInstallCommand)}>
              <Ionicons name="copy-outline" size={16} color={TEXT_PRIMARY} />
              <Text style={styles.secondaryButtonText}>Copy install command</Text>
            </Pressable>
          </View>

          <View style={styles.commandCard}>
            <Text style={styles.commandLabel}>Try this next</Text>
            <Text style={styles.commandText}>{cliStartCommand}</Text>
            <Pressable style={styles.secondaryButton} onPress={() => copyCommand('The start command', cliStartCommand)}>
              <Ionicons name="copy-outline" size={16} color={TEXT_PRIMARY} />
              <Text style={styles.secondaryButtonText}>Copy start command</Text>
            </Pressable>
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
  scrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 20,
    gap: 16,
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
    fontSize: 30,
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
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 22,
    padding: 18,
    gap: 14,
  },
  sectionTitle: {
    color: TEXT_PRIMARY,
    fontSize: 22,
    fontFamily: FONTS.heading,
  },
  sectionBody: {
    color: TEXT_SECONDARY,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONTS.body,
  },
  sectionHint: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    lineHeight: 18,
    marginTop: -4,
    fontFamily: FONTS.body,
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
    backgroundColor: BLUE,
    marginTop: 7,
  },
  reasonText: {
    flex: 1,
    color: TEXT_PRIMARY,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONTS.body,
  },
  commandCard: {
    backgroundColor: WHITE,
    borderRadius: 18,
    padding: 16,
    gap: 10,
  },
  commandLabel: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    fontFamily: FONTS.body,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  commandText: {
    color: TEXT_PRIMARY,
    fontSize: 16,
    lineHeight: 22,
    fontFamily: FONTS.heading,
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
    backgroundColor: BLUE_WASH,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: BORDER,
  },
  secondaryButtonText: {
    color: TEXT_PRIMARY,
    fontSize: 14,
    fontFamily: FONTS.body,
  },
});
