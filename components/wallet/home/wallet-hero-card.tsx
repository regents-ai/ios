import { StyleSheet, Text, View } from 'react-native';
import { EaseView } from 'react-native-ease';

import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import { getEaseAnimate, getEaseInitialAnimate, getEaseTransition } from '@/components/motion/easePresets';
import { useReducedMotion } from '@/components/motion/useReducedMotion';

const { BLUE, BLUE_WASH, BORDER, CARD_BG, TEXT_PRIMARY, TEXT_SECONDARY, WHITE } = COLORS;

export function WalletHeroCard() {
  const reducedMotionEnabled = useReducedMotion();

  return (
    <EaseView
      initialAnimate={getEaseInitialAnimate('screen')}
      animate={getEaseAnimate('screen')}
      transition={getEaseTransition('screen', reducedMotionEnabled)}
      style={styles.heroCard}
    >
      <View style={styles.heroTopRow}>
        <Text style={styles.heroEyebrow}>Base + USDC</Text>
        <View style={styles.heroPill}>
          <Text style={styles.heroPillText}>Primary path</Text>
        </View>
      </View>
      <Text style={styles.heroTitle}>Keep the fastest wallet path up front.</Text>
      <Text style={styles.heroBody}>
        Start with Base and USDC, then move money, review activity, and cash out without hunting through the app.
      </Text>
      <View style={styles.heroTagRow}>
        <View style={styles.heroTag}>
          <Text style={styles.heroTagText}>Buy on Base</Text>
        </View>
        <View style={styles.heroTag}>
          <Text style={styles.heroTagText}>Move USDC</Text>
        </View>
        <View style={styles.heroTag}>
          <Text style={styles.heroTagText}>Keep actions close</Text>
        </View>
      </View>
    </EaseView>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    margin: 16,
    marginBottom: 0,
    backgroundColor: BLUE_WASH,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 18,
    gap: 12,
    shadowColor: BLUE,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 3,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  heroEyebrow: {
    color: BLUE,
    fontSize: 12,
    fontFamily: FONTS.heading,
  },
  heroPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
  },
  heroPillText: {
    color: BLUE,
    fontSize: 11,
    fontFamily: FONTS.body,
  },
  heroTitle: {
    color: TEXT_PRIMARY,
    fontSize: 23,
    lineHeight: 27,
    fontFamily: FONTS.heading,
  },
  heroBody: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    lineHeight: 20,
    fontFamily: FONTS.body,
  },
  heroTagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  heroTag: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
  },
  heroTagText: {
    color: TEXT_PRIMARY,
    fontSize: 11,
    fontFamily: FONTS.body,
  },
});
