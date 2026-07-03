import { RegentPressable } from '@/components/ui/RegentPressable';
import { FONTS, THEME_COLORS } from '@/theme/tokens';
import { useChatGptAuth } from '@/hooks/useChatGptAuth';
import { useRegentsAuth } from '@/hooks/useRegentsAuth';
import { hasRegentsAccountConfig } from '@/utils/mobilePublicConfig';
import { hasSeenOnboarding } from '@/utils/onboardingState';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { EaseView } from 'react-native-ease';
import {
  AccessibilityInfo,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

// This route can render before the ThemeProvider wraps the tree (see
// app/_layout.tsx), so it cannot read useTheme(). It uses the dark token set
// directly, mirroring the pre-config fallback screen in _layout.tsx.
const c = THEME_COLORS.dark;
const SCREEN_OFFSET = 12;
const CARD_OFFSET = 8;
const STAGGER_STEP = 50;

function buildEntryTransition(reduceMotion: boolean, delay = 0, duration = 220) {
  return reduceMotion
    ? { type: 'none' as const }
    : { type: 'timing' as const, duration, easing: 'easeOut' as const, delay };
}

function RegentsAccountRedirect({ hasChatGptSession }: { hasChatGptSession: boolean }) {
  const { isAuthenticated: isRegentsAuthenticated } = useRegentsAuth();
  const router = useRouter();
  const isAuthenticated = hasChatGptSession && isRegentsAuthenticated;

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/agents');
    }
  }, [isAuthenticated, router]);

  return null;
}

export default function LoginScreen() {
  const { error: chatGptError, isLoading: isChatGptLoading, isReady: isChatGptReady, session: chatGptSession, signIn } = useChatGptAuth();
  const router = useRouter();
  const [reduceMotion, setReduceMotion] = useState(false);
  const [firstRunChecked, setFirstRunChecked] = useState(false);
  const hasChatGptSession = !!chatGptSession;
  const canUseRegentsAccount = hasRegentsAccountConfig();

  // Brand-new installs see the welcome screen once before sign-in.
  useEffect(() => {
    let mounted = true;
    hasSeenOnboarding()
      .then((seen) => {
        if (!mounted) {
          return;
        }
        if (seen) {
          setFirstRunChecked(true);
        } else {
          router.replace('/onboarding');
        }
      })
      .catch(() => {
        if (mounted) {
          setFirstRunChecked(true);
        }
      });
    return () => {
      mounted = false;
    };
  }, [router]);

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

  const handleChatGptSignIn = async () => {
    try {
      await signIn();
    } catch {
      // The hook owns the visible error message.
    }
  };

  if (!isChatGptReady || !firstRunChecked) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingWrap}>
          <EaseView
            initialAnimate={{ opacity: 0, translateY: CARD_OFFSET }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={buildEntryTransition(reduceMotion)}
            style={styles.loadingCard}
          >
            <ActivityIndicator color={c.accent} style={styles.loadingSpinner} />
            <Text style={styles.loadingTitle}>Regents</Text>
            <Text style={styles.loadingText}>Getting sign-in ready...</Text>
          </EaseView>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {hasChatGptSession && canUseRegentsAccount ? <RegentsAccountRedirect hasChatGptSession={hasChatGptSession} /> : null}
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
            <Text style={styles.title}>Fund an AI agent in seconds</Text>
          </EaseView>

          <EaseView
            initialAnimate={{ opacity: 0, translateY: SCREEN_OFFSET }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={buildEntryTransition(reduceMotion, STAGGER_STEP * 2)}
          >
            <Text style={styles.subtitle}>
              {hasChatGptSession ? 'Choose how to continue.' : 'Sign in with ChatGPT, then connect your Regents account.'}
            </Text>
          </EaseView>

          {hasChatGptSession && canUseRegentsAccount ? (
            <>
              <EaseView
                initialAnimate={{ opacity: 0, translateY: CARD_OFFSET }}
                animate={{ opacity: 1, translateY: 0 }}
                transition={buildEntryTransition(reduceMotion, STAGGER_STEP * 3)}
              >
                <Text style={styles.accountTitle}>Connect your Regents account</Text>
              </EaseView>

              <EaseView
                initialAnimate={{ opacity: 0, translateY: CARD_OFFSET }}
                animate={{ opacity: 1, translateY: 0 }}
                transition={buildEntryTransition(reduceMotion, STAGGER_STEP * 4)}
                style={styles.actionWrap}
              >
                <RegentPressable style={styles.primaryButton} onPress={() => router.push({ pathname: '/email-verify', params: { mode: 'signin' } })}>
                  <Text style={styles.primaryButtonText}>Continue with email</Text>
                </RegentPressable>
              </EaseView>

              <EaseView
                initialAnimate={{ opacity: 0, translateY: CARD_OFFSET }}
                animate={{ opacity: 1, translateY: 0 }}
                transition={buildEntryTransition(reduceMotion, STAGGER_STEP * 5)}
                style={styles.actionWrap}
              >
                <RegentPressable style={styles.secondaryButton} onPress={() => router.push({ pathname: '/phone-verify', params: { mode: 'signin' } })}>
                  <Text style={styles.secondaryButtonText}>Continue with phone</Text>
                </RegentPressable>
              </EaseView>
            </>
          ) : hasChatGptSession ? (
            <EaseView
              initialAnimate={{ opacity: 0, translateY: CARD_OFFSET }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={buildEntryTransition(reduceMotion, STAGGER_STEP * 3)}
            >
              <Text style={styles.accountSetupText}>Regents account sign-in is not ready on this device.</Text>
            </EaseView>
          ) : (
            <EaseView
              initialAnimate={{ opacity: 0, translateY: CARD_OFFSET }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={buildEntryTransition(reduceMotion, STAGGER_STEP * 3)}
              style={styles.actionWrap}
            >
              <RegentPressable style={[styles.chatGptButton, isChatGptLoading && styles.disabledButton]} onPress={handleChatGptSignIn} disabled={isChatGptLoading}>
                <View style={styles.chatGptButtonContent}>
                  <Ionicons name="sparkles-outline" size={20} color={c.text} />
                  {isChatGptLoading ? <ActivityIndicator color={c.text} /> : <Text style={styles.chatGptButtonText}>Sign in with ChatGPT</Text>}
                  <Ionicons name="arrow-forward" size={22} color={c.text} />
                </View>
              </RegentPressable>
            </EaseView>
          )}

          {chatGptError ? (
            <Text style={styles.errorText}>{chatGptError}</Text>
          ) : (
            <Text style={styles.helperText}>Apple Pay is available after sign-in where supported.</Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.bg,
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
    color: c.text,
    fontSize: 44,
    lineHeight: 48,
    fontFamily: FONTS.title,
  },
  title: {
    color: c.text,
    textAlign: 'center',
    fontSize: 32,
    lineHeight: 38,
    fontFamily: FONTS.title,
  },
  subtitle: {
    color: c.textMuted,
    textAlign: 'center',
    fontSize: 18,
    lineHeight: 24,
    fontFamily: FONTS.ui,
    marginBottom: 26,
  },
  actionWrap: {
    width: '100%',
  },
  accountTitle: {
    color: c.text,
    textAlign: 'center',
    fontSize: 22,
    lineHeight: 28,
    fontFamily: FONTS.title,
    marginBottom: 2,
  },
  chatGptButton: {
    minHeight: 58,
    borderRadius: 18,
    backgroundColor: '#05070D',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  chatGptButtonContent: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  chatGptButtonText: {
    color: c.text,
    fontSize: 18,
    fontFamily: FONTS.ui,
    flex: 1,
    textAlign: 'center',
  },
  primaryButton: {
    minHeight: 58,
    borderRadius: 18,
    backgroundColor: c.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  primaryButtonText: {
    color: c.onAccent,
    fontSize: 18,
    fontFamily: FONTS.ui,
  },
  secondaryButton: {
    minHeight: 58,
    borderRadius: 18,
    backgroundColor: c.surfaceElevated,
    borderWidth: 1,
    borderColor: c.hairlineStrong,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  secondaryButtonText: {
    color: c.text,
    fontSize: 18,
    fontFamily: FONTS.ui,
  },
  disabledButton: {
    opacity: 0.65,
  },
  helperText: {
    color: c.textMuted,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONTS.ui,
    marginTop: 8,
  },
  errorText: {
    color: c.error,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONTS.ui,
    marginTop: 8,
  },
  accountSetupText: {
    color: c.textMuted,
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 22,
    fontFamily: FONTS.ui,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  loadingCard: {
    backgroundColor: c.surfaceElevated,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: c.hairlineStrong,
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
    color: c.text,
    fontSize: 24,
    lineHeight: 30,
    fontFamily: FONTS.title,
  },
  loadingText: {
    color: c.textMuted,
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 22,
    fontFamily: FONTS.ui,
  },
});
