import { RegentPressable } from '@/components/ui/RegentPressable';
import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

const { CARD_BG, CARD_ALT, TEXT_PRIMARY, TEXT_SECONDARY, BLUE, BORDER, WHITE } = COLORS;

type HelpSupportSectionProps = {
  onOpenPhoneVerify: () => void;
};

export function HelpSupportSection({
  onOpenPhoneVerify,
}: HelpSupportSectionProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Help</Text>
      <View style={styles.infoBlock}>
        <Text style={styles.valueText}>Need help with money movement or account steps?</Text>
        <Text style={styles.helperText}>Support can help with wallet questions, checkout steps, and payment issues.</Text>
      </View>
      <View style={styles.buttonRow}>
        <RegentPressable style={styles.primaryButton} onPress={() => router.push('/support')}>
          <Text style={styles.primaryButtonText}>Open support</Text>
        </RegentPressable>
        <RegentPressable style={styles.secondaryButton} onPress={onOpenPhoneVerify}>
          <Text style={styles.secondaryButtonText}>Phone help</Text>
        </RegentPressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 20,
    gap: 18,
    shadowColor: BLUE,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 2,
  },
  cardTitle: {
    color: TEXT_PRIMARY,
    fontSize: 24,
    fontFamily: FONTS.heading,
  },
  infoBlock: {
    gap: 8,
  },
  valueText: {
    color: TEXT_PRIMARY,
    fontSize: 18,
    lineHeight: 24,
    fontFamily: FONTS.body,
  },
  helperText: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FONTS.body,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  primaryButton: {
    backgroundColor: BLUE,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    minWidth: 120,
  },
  primaryButtonText: {
    color: WHITE,
    fontSize: 15,
    lineHeight: 20,
    textAlign: 'center',
    fontFamily: FONTS.body,
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD_ALT,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    minWidth: 120,
  },
  secondaryButtonText: {
    color: TEXT_PRIMARY,
    fontSize: 15,
    lineHeight: 20,
    textAlign: 'center',
    fontFamily: FONTS.body,
  },
});
