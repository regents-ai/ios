import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import { routes } from '@/utils/navigation/routes';

const { DARK_BG, CARD_BG, TEXT_PRIMARY, TEXT_SECONDARY, BLUE, WHITE, BORDER, SUCCESS } = COLORS;

export default function OnrampReturnScreen() {
  const params = useLocalSearchParams<{ partnerUserRef?: string }>();
  const hasReference = typeof params.partnerUserRef === 'string' && params.partnerUserRef.length > 0;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name="checkmark" size={28} color={WHITE} />
          </View>
          <Text style={styles.title}>Purchase received</Text>
          <Text style={styles.body}>
            Coinbase is checking the purchase now. Your wallet will update after the purchase finishes.
          </Text>
          {hasReference ? (
            <View style={styles.referenceBox}>
              <Text style={styles.referenceLabel}>Reference</Text>
              <Text style={styles.referenceText}>{params.partnerUserRef}</Text>
            </View>
          ) : null}
          <Pressable style={styles.primaryButton} onPress={() => router.replace(routes.wallet())}>
            <Ionicons name="wallet-outline" size={18} color={WHITE} />
            <Text style={styles.primaryButtonText}>Back to Wallet</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DARK_BG,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 24,
    padding: 22,
    gap: 16,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: SUCCESS,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: TEXT_PRIMARY,
    fontSize: 30,
    lineHeight: 34,
    fontFamily: FONTS.heading,
  },
  body: {
    color: TEXT_SECONDARY,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: FONTS.body,
  },
  referenceBox: {
    backgroundColor: DARK_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },
  referenceLabel: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontFamily: FONTS.body,
  },
  referenceText: {
    color: TEXT_PRIMARY,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONTS.body,
  },
  primaryButton: {
    backgroundColor: BLUE,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryButtonText: {
    color: WHITE,
    fontSize: 15,
    fontFamily: FONTS.body,
  },
});
