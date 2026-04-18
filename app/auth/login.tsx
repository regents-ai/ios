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
import { isTestSessionActive } from '@/utils/sharedState';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

const { DARK_BG, CARD_BG, TEXT_SECONDARY, BLUE, WHITE, BORDER, BLUE_WASH } = COLORS;

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
            Buy stablecoins, move funds between cash and crypto, and keep close to your agents from one place.
          </Text>
        </View>

        <View style={styles.authButtonsContainer}>
          <Pressable
            style={({ pressed }) => [
              styles.authButton,
              styles.primaryAuthButton,
              pressed && { opacity: 0.85 }
            ]}
            onPress={handleEmailLogin}
          >
            <Ionicons name="mail-outline" size={24} color={WHITE} style={styles.buttonIcon} />
            <Text style={styles.authButtonText}>Continue with Email</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.authButton,
              styles.secondaryAuthButton,
              pressed && { opacity: 0.85 }
            ]}
            onPress={handlePhoneLogin}
          >
            <Ionicons name="call-outline" size={24} color={BLUE} style={styles.buttonIcon} />
            <Text style={styles.secondaryAuthButtonText}>Continue with Phone</Text>
          </Pressable>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Secure sign in for your mobile wallet
          </Text>
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
  authButton: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingVertical: 18,
    borderRadius: 16,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryAuthButton: {
    backgroundColor: BLUE,
    shadowColor: BLUE,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 4,
  },
  secondaryAuthButton: {
    backgroundColor: BLUE_WASH,
    borderWidth: 1,
    borderColor: BORDER,
  },
  buttonIcon: {
    marginRight: 12,
  },
  authButtonText: {
    color: WHITE,
    fontSize: 18,
    fontFamily: FONTS.body,
  },
  secondaryAuthButtonText: {
    color: BLUE,
    fontSize: 18,
    fontFamily: FONTS.body,
  },
  footer: {
    marginTop: 18,
    paddingHorizontal: 6,
  },
  footerText: {
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
