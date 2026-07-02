import { RegentPressable } from '@/components/ui/RegentPressable';
import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import { StyleSheet, Text } from 'react-native';

const { CARD_BG, BORDER, DANGER } = COLORS;

type SignOutSectionProps = {
  onSignOut: () => void;
};

export function SignOutSection({
  onSignOut,
}: SignOutSectionProps) {
  return (
    <RegentPressable haptic="warning" style={styles.signOutCta} onPress={onSignOut}>
      <Text style={styles.signOutCtaText}>Sign out</Text>
    </RegentPressable>
  );
}

const styles = StyleSheet.create({
  signOutCta: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 22,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  signOutCtaText: {
    color: DANGER,
    fontSize: 18,
    fontFamily: FONTS.body,
  },
});
