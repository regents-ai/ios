import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import { useRegentsAuth } from '@/hooks/useRegentsAuth';
import { isTestSessionActive } from '@/utils/state/reviewSessionState';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { EaseView } from 'react-native-ease';
import {
  AccessibilityInfo,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const { DARK_BG, CARD_BG, TEXT_PRIMARY, TEXT_SECONDARY, BLUE, WHITE, BORDER } = COLORS;
const SCREEN_OFFSET = 12;
const CARD_OFFSET = 8;
const STAGGER_STEP = 50;

function buildEntryTransition(reduceMotion: boolean, delay = 0, duration = 220) {
  return reduceMotion
    ? { type: 'none' as const }
    : { type: 'timing' as const, duration, easing: 'easeOut' as const, delay };
}

export default function LoginScreen() {
  const { isAuthenticated } = useRegentsAuth();
  const router = useRouter();
  const testSession = isTestSessionActive();
  const [showTestMessage, setShowTestMessage] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) {
          setReduceMotion(enabled);
        }
      })
      .catch(() => undefined);

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (testSession) {
      setShowTestMessage(true);
      const redirectTimer = setTimeout(() => {
        router.replace('/agents');
      }, 1500);

      return () => clearTimeout(redirectTimer);
    }
  }, [router, testSession]);

  useEffect(() => {
    if (isAuthenticated && !testSession) {
      router.replace('/agents');
    }
  }, [isAuthenticated, router, testSession]);

  if (showTestMessage) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingWrap}>
          <EaseView
            initialAnimate={{ opacity: 0, translateY: SCREEN_OFFSET }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={buildEntryTransition(reduceMotion)}
            style={styles.loadingCard}
          >
            <Text style={styles.brand}>Regents</Text>
            <ActivityIndicator size="large" color={BLUE} style={styles.loadingSpinner} />
            <Text style={styles.loadingTitle}>Getting Regents ready</Text>
            <Text style={styles.loadingText}>This device is already signed in.</Text>
          </EaseView>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardWrap}>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <EaseView
            initialAnimate={{ opacity: 0, translateY: CARD_OFFSET }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={buildEntryTransition(reduceMotion)}
            style={styles.brandWrap}
          >
            <Text style={styles.brand}>Regents</Text>
          </EaseView>

          <EaseView
            initialAnimate={{ opacity: 0, translateY: SCREEN_OFFSET }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={buildEntryTransition(reduceMotion, STAGGER_STEP)}
          >
            <Text style={styles.title}>Set up your Regents</Text>
          </EaseView>

          <EaseView
            initialAnimate={{ opacity: 0, translateY: SCREEN_OFFSET }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={buildEntryTransition(reduceMotion, STAGGER_STEP * 2)}
          >
            <Text style={styles.subtitle}>Sign in to continue.</Text>
          </EaseView>

          <EaseView
            initialAnimate={{ opacity: 0, translateY: CARD_OFFSET }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={buildEntryTransition(reduceMotion, STAGGER_STEP * 3)}
            style={styles.actionWrap}
          >
            <Pressable style={styles.primaryButton} onPress={() => router.push({ pathname: '/email-verify', params: { mode: 'signin' } })}>
              <Text style={styles.primaryButtonText}>Continue with email</Text>
            </Pressable>
          </EaseView>

          <EaseView
            initialAnimate={{ opacity: 0, translateY: CARD_OFFSET }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={buildEntryTransition(reduceMotion, STAGGER_STEP * 4)}
            style={styles.actionWrap}
          >
            <Pressable style={styles.secondaryButton} onPress={() => router.push({ pathname: '/phone-verify', params: { mode: 'signin' } })}>
              <Text style={styles.secondaryButtonText}>Continue with phone</Text>
            </Pressable>
          </EaseView>

          <EaseView
            initialAnimate={{ opacity: 0, translateY: CARD_OFFSET }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={buildEntryTransition(reduceMotion, STAGGER_STEP * 5)}
          >
            <Text style={styles.helperText}>You can choose Apple Pay with Coinbase after you sign in.</Text>
          </EaseView>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DARK_BG,
  },
  keyboardWrap: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
    gap: 18,
  },
  brandWrap: {
    alignItems: 'center',
    marginBottom: 24,
  },
  brand: {
    color: TEXT_PRIMARY,
    fontSize: 44,
    lineHeight: 48,
    fontFamily: FONTS.heading,
  },
  title: {
    color: TEXT_PRIMARY,
    textAlign: 'center',
    fontSize: 32,
    lineHeight: 38,
    fontFamily: FONTS.heading,
  },
  subtitle: {
    color: TEXT_SECONDARY,
    textAlign: 'center',
    fontSize: 18,
    lineHeight: 24,
    fontFamily: FONTS.body,
    marginBottom: 26,
  },
  actionWrap: {
    width: '100%',
  },
  primaryButton: {
    minHeight: 58,
    borderRadius: 18,
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  primaryButtonText: {
    color: WHITE,
    fontSize: 18,
    fontFamily: FONTS.body,
  },
  secondaryButton: {
    minHeight: 58,
    borderRadius: 18,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  secondaryButtonText: {
    color: TEXT_PRIMARY,
    fontSize: 18,
    fontFamily: FONTS.body,
  },
  helperText: {
    color: TEXT_SECONDARY,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONTS.body,
    marginTop: 8,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  loadingCard: {
    backgroundColor: CARD_BG,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 28,
    paddingVertical: 36,
    alignItems: 'center',
    gap: 10,
  },
  loadingSpinner: {
    marginTop: 12,
    marginBottom: 8,
  },
  loadingTitle: {
    color: TEXT_PRIMARY,
    fontSize: 24,
    lineHeight: 30,
    fontFamily: FONTS.heading,
  },
  loadingText: {
    color: TEXT_SECONDARY,
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 22,
    fontFamily: FONTS.body,
  },
});
