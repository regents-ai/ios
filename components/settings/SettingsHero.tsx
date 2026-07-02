import { RegentPressable } from '@/components/ui/RegentPressable';
import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

const { CARD_ALT, TEXT_PRIMARY, TEXT_SECONDARY, BLUE } = COLORS;

export function SettingsHero() {
  return (
    <View style={styles.hero}>
      <View style={styles.header}>
        <RegentPressable pressStyle="icon" onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={20} color={TEXT_PRIMARY} />
        </RegentPressable>
      </View>
      <Text style={styles.heroEyebrow}>Regents</Text>
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.heroSubtitle}>Account, wallet, and help in one place.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: CARD_ALT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroEyebrow: {
    color: BLUE,
    fontSize: 12,
    fontFamily: FONTS.heading,
  },
  title: {
    color: TEXT_PRIMARY,
    fontSize: 42,
    lineHeight: 44,
    fontFamily: FONTS.heading,
  },
  heroSubtitle: {
    color: TEXT_SECONDARY,
    fontSize: 16,
    lineHeight: 22,
    fontFamily: FONTS.body,
  },
});
