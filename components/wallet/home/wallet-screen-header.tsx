import { StyleSheet, Text, View } from 'react-native';

import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';

const { BLUE, BORDER, CARD_BG } = COLORS;

export function WalletScreenHeader() {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>Wallet</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 18,
    backgroundColor: CARD_BG,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  title: {
    fontSize: 20,
    color: BLUE,
    fontFamily: FONTS.heading,
  },
});
