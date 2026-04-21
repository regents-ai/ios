/**
 * Login Screen - Authentication page
 *
 * Full-screen login UI for Regents Mobile.
 * Users must sign in to access the app.
 * TestFlight accounts auto-proceed after brief display.
 */

import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import { useRegentsAuth } from '@/hooks/useRegentsAuth';
import { isTestSessionActive } from '@/utils/state/reviewSessionState';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

const { DARK_BG, CARD_BG, TEXT_PRIMARY, TEXT_SECONDARY, BLUE, WHITE, BORDER, BLUE_WASH } = COLORS;

export default function LoginScreen() {
  const { isAuthenticated } = useRegentsAuth();
  const router = useRouter();
  const testSession = isTestSessionActive();
  const [showTestMessage, setShowTestMessage] = useState(false);

  // TestFlight auto-login
  useEffect(() => {
    if (testSession) {
      setShowTestMessage(true);
      // Brief delay to show message, then proceed
      setTimeout(() => {
        router.replace('/wallet');
      }, 1500);
    }
  }, [router, testSession]);

  // Real user logged in → navigate to app
  useEffect(() => {
    if (isAuthenticated && !testSession) {
      router.replace('/wallet');
    }
  }, [isAuthenticated, router, testSession]);

  const handleEmailLogin = () => {
    router.push({
      pathname: '/email-verify',
      params: { mode: 'signin' }
    });
  };

  const handlePhoneLogin = () => {
    router.push({
      pathname: '/phone-verify',
      params: { mode: 'signin' }
    });
  };

  // TestFlight loading state
  if (showTestMessage) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <View style={styles.testMessageContainer}>
            <ActivityIndicator size="large" color={BLUE} style={{ marginBottom: 16 }} />
            <Text style={styles.testTitle}>Review access</Text>
            <Text style={styles.testSubtitle}>A review account was found.{'\n'}Opening the wallet now.</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.heroCard}>
          <View style={styles.eyebrowRow}>
            <View style={styles.eyebrowDot} />
            <Text style={styles.eyebrow}>Regents Mobile</Text>
          </View>
          <Text style={styles.title}>Move money with a calmer wallet.</Text>
          <Text style={styles.subtitle}>
            Buy stablecoins, move funds between cash and crypto, and preview the future agent tools from one place.
          </Text>
        </View>

        <View style={styles.guidanceCard}>
          <Text style={styles.guidanceTitle}>Use the same detail you already use with Regents</Text>
          <Text style={styles.guidanceText}>
            Choose email if you want a quieter sign-in flow. Choose phone if you want faster access on this device.
          </Text>
        </View>

        <View style={styles.authButtonsContainer}>
          <Pressable
            style={({ pressed }) => [
              styles.authOptionCard,
              pressed && styles.authOptionPressed,
            ]}
            onPress={handleEmailLogin}
          >
            <View style={styles.optionIconWrap}>
              <Ionicons name="mail-outline" size={22} color={WHITE} />
            </View>
            <View style={styles.optionCopy}>
              <Text style={styles.authOptionTitle}>Continue with Email</Text>
              <Text style={styles.authOptionText}>Best when you want to match the inbox you already use for Regents.</Text>
            </View>
            <Ionicons name="arrow-forward" size={20} color={BLUE} />
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.authOptionCard,
              styles.secondaryAuthOptionCard,
              pressed && styles.authOptionPressed,
            ]}
            onPress={handlePhoneLogin}
          >
            <View style={[styles.optionIconWrap, styles.optionIconSecondaryWrap]}>
              <Ionicons name="call-outline" size={22} color={BLUE} />
            </View>
            <View style={styles.optionCopy}>
              <Text style={styles.authOptionTitle}>Continue with Phone</Text>
              <Text style={styles.authOptionText}>Best when you want a quick code on the device already in your hand.</Text>
            </View>
            <Ionicons name="arrow-forward" size={20} color={BLUE} />
          </Pressable>
        </View>

        <Text style={styles.footerText}>Your wallet opens after sign-in. You can switch methods later in settings.</Text>
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
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  heroCard: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 24,
    padding: 24,
    marginBottom: 24,
    gap: 14,
    shadowColor: BLUE,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 3,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  eyebrowDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: BLUE,
  },
  eyebrow: {
    fontSize: 12,
    letterSpacing: 1.2,
    color: BLUE,
    textTransform: 'uppercase',
    fontFamily: FONTS.body,
  },
  title: {
    fontSize: 30,
    lineHeight: 36,
    color: BLUE,
    fontFamily: FONTS.heading,
  },
  subtitle: {
    fontSize: 16,
    color: TEXT_SECONDARY,
    lineHeight: 24,
    fontFamily: FONTS.body,
  },
  authButtonsContainer: {
    width: '100%',
    gap: 16,
  },
  guidanceCard: {
    backgroundColor: BLUE_WASH,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 18,
    padding: 18,
    gap: 8,
    marginBottom: 20,
  },
  guidanceTitle: {
    color: TEXT_PRIMARY,
    fontSize: 16,
    lineHeight: 22,
    fontFamily: FONTS.heading,
  },
  guidanceText: {
    color: TEXT_SECONDARY,
    fontSize: 14,
    lineHeight: 21,
    fontFamily: FONTS.body,
  },
  authOptionCard: {
    flexDirection: 'row',
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderRadius: 20,
    width: '100%',
    alignItems: 'center',
    gap: 14,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    shadowColor: BLUE,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
  },
  secondaryAuthOptionCard: {
    backgroundColor: BLUE_WASH,
  },
  authOptionPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
  optionIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BLUE,
  },
  optionIconSecondaryWrap: {
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
  },
  optionCopy: {
    flex: 1,
    gap: 4,
  },
  authOptionTitle: {
    color: TEXT_PRIMARY,
    fontSize: 18,
    lineHeight: 22,
    fontFamily: FONTS.heading,
  },
  authOptionText: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: FONTS.body,
  },
  footerText: {
    marginTop: 18,
    paddingHorizontal: 6,
    fontSize: 12,
    color: TEXT_SECONDARY,
    lineHeight: 18,
    fontFamily: FONTS.body,
  },
  testMessageContainer: {
    backgroundColor: CARD_BG,
    padding: 32,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    shadowColor: BLUE,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 3,
  },
  testTitle: {
    fontSize: 24,
    color: BLUE,
    marginBottom: 8,
    fontFamily: FONTS.heading,
  },
  testSubtitle: {
    fontSize: 16,
    color: TEXT_SECONDARY,
    textAlign: 'center',
    lineHeight: 24,
    fontFamily: FONTS.body,
  },
});
