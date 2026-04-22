import { StyleSheet, Text, View } from 'react-native';

import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';

const { BLUE, BORDER, CARD_BG, TEXT_SECONDARY } = COLORS;

export function WalletScreenHeader() {
  return (
    <View style={styles.header}>
      <View style={styles.copy}>
        <Text style={styles.title}>Wallet</Text>
        <Text style={styles.subtitle}>Send, buy, and check balances in one place.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
    backgroundColor: CARD_BG,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  copy: {
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
