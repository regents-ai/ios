import { VerificationMotion } from '@/components/auth/verification-motion';
import { CoinbaseAlert } from '@/components/ui/CoinbaseAlerts';
import { RegentPressable } from '@/components/ui/RegentPressable';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { useChatGptAuth } from '@/hooks/useChatGptAuth';
import { useVerificationResendTimer } from '@/hooks/useVerificationResendTimer';
import { useLinkEmail, useLoginWithEmail } from '@privy-io/expo';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { getVerificationSuccessAction } from '../utils/authFlowState';
import { resolvePostAuthLanding } from '../utils/state/postAuthDestination';

export default function EmailCodeScreen() {
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const router = useRouter();
  const params = useLocalSearchParams();
  const email = params.email as string;
  const mode = (params.mode as 'signin' | 'link') || 'signin';

  const [otp, setOtp] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [sending, setSending] = useState(false);
  const [alert, setAlert] = useState<{ visible: boolean; title: string; message: string; type: 'success' | 'error' | 'info' }>({
    visible: false,
    title: '',
    message: '',
    type: 'info',
  });
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { sendCode: sendLoginCode, loginWithCode } = useLoginWithEmail();
  const { sendCode: sendLinkCode, linkWithCode } = useLinkEmail();
  const { isReady: isChatGptReady, session: chatGptSession } = useChatGptAuth();
  const {
    canResend: resendReady,
    resendSeconds,
    resetResendTimer,
  } = useVerificationResendTimer();

  useEffect(() => {
    return () => {
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isChatGptReady && !chatGptSession) {
      router.replace('/auth/login');
    }
  }, [chatGptSession, isChatGptReady, router]);

  const canResend = resendReady && !sending && !verifying;
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
    if (!isChatGptReady || !chatGptSession) {
      setAlert({
        visible: true,
        title: 'Sign in with ChatGPT',
        message: 'Finish ChatGPT sign-in before you continue.',
        type: 'error',
      });
      return;
    }

    setSending(true);
    try {
      if (mode === 'signin') {
        await sendLoginCode({ email });
      } else {
        await sendLinkCode({ email });
      }
      resetResendTimer();
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
    if (!isChatGptReady || !chatGptSession) {
      setAlert({
        visible: true,
        title: 'Sign in with ChatGPT',
        message: 'Finish ChatGPT sign-in before you continue.',
        type: 'error',
      });
      return;
    }

    setVerifying(true);

    try {
      if (mode === 'signin') {
        await loginWithCode({ email, code: otp });
        const nextAction = getVerificationSuccessAction(mode);
        if (nextAction === 'go_wallet') {
          router.replace(resolvePostAuthLanding());
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
            router.replace(resolvePostAuthLanding());
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
          <VerificationMotion style={styles.header}>
            <RegentPressable pressStyle="icon" onPress={() => router.back()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </RegentPressable>
          </VerificationMotion>

          <View style={styles.content}>
            <VerificationMotion order={1} variant="screen">
              <Text style={styles.title}>{title}</Text>
            </VerificationMotion>

            <VerificationMotion order={2} variant="screen">
              <Text style={styles.subtitle}>We sent a short code to {email}.</Text>
            </VerificationMotion>

            <VerificationMotion order={3}>
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
            </VerificationMotion>

            <VerificationMotion order={4}>
              {resendSeconds > 0 ? (
                <Text style={styles.helperText}>You can ask for a new code in {resendSeconds}s.</Text>
              ) : (
                <RegentPressable pressStyle="none" onPress={resendCode} disabled={!canResend}>
                  <Text style={[styles.linkText, !canResend && styles.disabledText]}>Resend code</Text>
                </RegentPressable>
              )}
            </VerificationMotion>
          </View>

          <VerificationMotion
            order={5}
            style={styles.footer}
          >
            <RegentPressable
              style={[styles.primaryButton, (verifying || otp.length < 4) && styles.disabledButton]}
              onPress={verifyEmail}
              disabled={verifying || otp.length < 4}
            >
              {verifying ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.primaryButtonText}>Continue</Text>}
            </RegentPressable>
          </VerificationMotion>
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

function makeStyles({ colors, fonts }: Theme) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
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
    color: colors.text,
    textAlign: 'center',
    fontSize: 32,
    lineHeight: 38,
    fontFamily: fonts.title,
  },
  subtitle: {
    color: colors.textMuted,
    textAlign: 'center',
    fontSize: 17,
    lineHeight: 24,
    fontFamily: fonts.ui,
    marginBottom: 14,
  },
  fieldLabel: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 22,
    fontFamily: fonts.ui,
    marginBottom: 12,
  },
  codeInput: {
    minHeight: 64,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 18,
    color: colors.text,
    fontSize: 28,
    textAlign: 'center',
    letterSpacing: 8,
    fontFamily: fonts.ui,
  },
  helperText: {
    color: colors.textMuted,
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 22,
    fontFamily: fonts.ui,
    marginTop: 8,
  },
  linkText: {
    color: colors.accent,
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 22,
    fontFamily: fonts.ui,
    marginTop: 8,
  },
  footer: {
    paddingTop: 24,
  },
  primaryButton: {
    minHeight: 58,
    borderRadius: 18,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  primaryButtonText: {
    color: colors.onAccent,
    fontSize: 18,
    fontFamily: fonts.ui,
  },
  disabledButton: {
    opacity: 0.5,
  },
  disabledText: {
    opacity: 0.45,
  },
  });
}
