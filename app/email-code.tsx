import { CoinbaseAlert } from '@/components/ui/CoinbaseAlerts';
import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import { isTestAccount, TEST_ACCOUNTS } from '@/constants/TestAccounts';
import { useLinkEmail, useLoginWithEmail } from '@privy-io/expo';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
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
  TextInput,
  View,
} from 'react-native';

import { getVerificationSuccessAction } from '../utils/authFlowState';
import { setTestSession } from '../utils/state/reviewSessionState';
import { setCurrentSolanaAddress, setCurrentWalletAddress } from '../utils/state/walletRuntimeState';

const { DARK_BG, CARD_BG, TEXT_PRIMARY, TEXT_SECONDARY, BLUE, WHITE, BORDER } = COLORS;
const RESEND_SECONDS = 30;
const SCREEN_OFFSET = 12;
const CARD_OFFSET = 8;
const STAGGER_STEP = 50;

function buildEntryTransition(reduceMotion: boolean, delay = 0, duration = 220) {
  return reduceMotion
    ? { type: 'none' as const }
    : { type: 'timing' as const, duration, easing: 'easeOut' as const, delay };
}

export default function EmailCodeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const email = params.email as string;
  const mode = (params.mode as 'signin' | 'link') || 'signin';

  const [otp, setOtp] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [sending, setSending] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(RESEND_SECONDS);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [alert, setAlert] = useState<{ visible: boolean; title: string; message: string; type: 'success' | 'error' | 'info' }>({
    visible: false,
    title: '',
    message: '',
    type: 'info',
  });
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { sendCode: sendLoginCode, loginWithCode } = useLoginWithEmail();
  const { sendCode: sendLinkCode, linkWithCode } = useLinkEmail();

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
    if (resendSeconds <= 0) return;
    const timer = setInterval(() => setResendSeconds((value) => value - 1), 1000);
    return () => clearInterval(timer);
  }, [resendSeconds]);

  useEffect(() => {
    return () => {
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
      }
    };
  }, []);

  const canResend = resendSeconds <= 0 && !sending && !verifying;
  const scheduleDismiss = (run: () => void) => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
    }

    dismissTimerRef.current = setTimeout(() => {
      dismissTimerRef.current = null;
      run();
    }, 1500);
  };

  const resendCode = async () => {
    if (isTestAccount(email)) {
      setResendSeconds(RESEND_SECONDS);
      return;
    }

    setSending(true);
    try {
      if (mode === 'signin') {
        await sendLoginCode({ email });
      } else {
        await sendLinkCode({ email });
      }
      setResendSeconds(RESEND_SECONDS);
    } catch (error: any) {
      setAlert({
        visible: true,
        title: 'Code not sent',
        message: error.message || 'Please try again.',
        type: 'error',
      });
    } finally {
      setSending(false);
    }
  };

  const verifyEmail = async () => {
    if (!otp) return;
    setVerifying(true);

    try {
      if (isTestAccount(email) && mode === 'signin') {
        if (otp !== TEST_ACCOUNTS.otp) {
          throw new Error(`Use ${TEST_ACCOUNTS.otp} for the preview account.`);
        }

        await setTestSession(TEST_ACCOUNTS.wallets.evm, TEST_ACCOUNTS.wallets.solana);
        setCurrentWalletAddress(TEST_ACCOUNTS.wallets.evm);
        setCurrentSolanaAddress(TEST_ACCOUNTS.wallets.solana);
        const nextAction = getVerificationSuccessAction(mode);
        if (nextAction === 'go_wallet') {
          router.replace('/agents');
        } else {
          router.dismissAll();
        }
        return;
      }

      if (mode === 'signin') {
        await loginWithCode({ email, code: otp });
        const nextAction = getVerificationSuccessAction(mode);
        if (nextAction === 'go_wallet') {
          router.replace('/agents');
        } else {
          router.dismissAll();
        }
      } else {
        await linkWithCode({ email, code: otp });
        setAlert({
          visible: true,
          title: 'Email added',
          message: 'Your email address is ready to use.',
          type: 'success',
        });
        scheduleDismiss(() => {
          const nextAction = getVerificationSuccessAction(mode);
          if (nextAction === 'go_wallet') {
            router.replace('/agents');
          } else {
            router.dismissAll();
          }
        });
      }
    } catch (error: any) {
      setAlert({
        visible: true,
        title: 'Code did not match',
        message: error.message || 'Please try again.',
        type: 'error',
      });
    } finally {
      setVerifying(false);
    }
  };

  const title = mode === 'signin' ? 'Enter your code' : 'Confirm your email';

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
            style={styles.header}
          >
            <Pressable onPress={() => router.back()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color={TEXT_PRIMARY} />
            </Pressable>
          </EaseView>

          <View style={styles.content}>
            <EaseView
              initialAnimate={{ opacity: 0, translateY: SCREEN_OFFSET }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={buildEntryTransition(reduceMotion, STAGGER_STEP)}
            >
              <Text style={styles.title}>{title}</Text>
            </EaseView>

            <EaseView
              initialAnimate={{ opacity: 0, translateY: SCREEN_OFFSET }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={buildEntryTransition(reduceMotion, STAGGER_STEP * 2)}
            >
              <Text style={styles.subtitle}>We sent a short code to {email}.</Text>
            </EaseView>

            <EaseView
              initialAnimate={{ opacity: 0, translateY: CARD_OFFSET }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={buildEntryTransition(reduceMotion, STAGGER_STEP * 3)}
            >
              <Text style={styles.fieldLabel}>Code</Text>
              <TextInput
                style={styles.codeInput}
                value={otp}
                onChangeText={setOtp}
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                keyboardType="number-pad"
                maxLength={6}
                editable={!verifying}
                selectTextOnFocus
                autoFocus
              />
            </EaseView>

            <EaseView
              initialAnimate={{ opacity: 0, translateY: CARD_OFFSET }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={buildEntryTransition(reduceMotion, STAGGER_STEP * 4)}
            >
              {resendSeconds > 0 ? (
                <Text style={styles.helperText}>You can ask for a new code in {resendSeconds}s.</Text>
              ) : (
                <Pressable onPress={resendCode} disabled={!canResend}>
                  <Text style={[styles.linkText, !canResend && styles.disabledText]}>Resend code</Text>
                </Pressable>
              )}
            </EaseView>
          </View>

          <EaseView
            initialAnimate={{ opacity: 0, translateY: CARD_OFFSET }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={buildEntryTransition(reduceMotion, STAGGER_STEP * 5)}
            style={styles.footer}
          >
            <Pressable
              style={[styles.primaryButton, (verifying || otp.length < 4) && styles.disabledButton]}
              onPress={verifyEmail}
              disabled={verifying || otp.length < 4}
            >
              {verifying ? <ActivityIndicator color={WHITE} /> : <Text style={styles.primaryButtonText}>Continue</Text>}
            </Pressable>
          </EaseView>
        </ScrollView>
      </KeyboardAvoidingView>

      <CoinbaseAlert
        visible={alert.visible}
        title={alert.title}
        message={alert.message}
        type={alert.type}
        onConfirm={() => setAlert((current) => ({ ...current, visible: false }))}
      />
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
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 28,
  },
  header: {
    marginBottom: 48,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    gap: 18,
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
    fontSize: 17,
    lineHeight: 24,
    fontFamily: FONTS.body,
    marginBottom: 14,
  },
  fieldLabel: {
    color: TEXT_PRIMARY,
    fontSize: 16,
    lineHeight: 22,
    fontFamily: FONTS.body,
    marginBottom: 12,
  },
  codeInput: {
    minHeight: 64,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD_BG,
    paddingHorizontal: 18,
    color: TEXT_PRIMARY,
    fontSize: 28,
    textAlign: 'center',
    letterSpacing: 8,
    fontFamily: FONTS.body,
  },
  helperText: {
    color: TEXT_SECONDARY,
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 22,
    fontFamily: FONTS.body,
    marginTop: 8,
  },
  linkText: {
    color: BLUE,
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 22,
    fontFamily: FONTS.body,
    marginTop: 8,
  },
  footer: {
    paddingTop: 24,
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
  disabledButton: {
    opacity: 0.5,
  },
  disabledText: {
    opacity: 0.45,
  },
});
