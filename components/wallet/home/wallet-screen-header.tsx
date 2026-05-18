import { StyleSheet, Text, View } from 'react-native';

import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import { ProfileButton } from '@/components/navigation/ProfileButton';

const { BLUE, BORDER, CARD_BG, TEXT_SECONDARY } = COLORS;

export function WalletScreenHeader() {
  return (
    <View style={styles.header}>
      <View style={styles.copy}>
        <Text style={styles.title}>Fund</Text>
        <Text style={styles.subtitle}>Add USDC for agent work, then pay or cash out when you need to.</Text>
      </View>
      <ProfileButton />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
    backgroundColor: CARD_BG,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  title: {
    fontSize: 22,
    lineHeight: 26,
    color: BLUE,
    fontFamily: FONTS.heading,
  },
  subtitle: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FONTS.body,
  },
});
