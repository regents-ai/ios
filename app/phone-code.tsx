import { VerificationMotion } from '@/components/auth/verification-motion';
import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import { useChatGptAuth } from '@/hooks/useChatGptAuth';
import { useRegentsAuth } from '@/hooks/useRegentsAuth';
import { useVerificationResendTimer } from '@/hooks/useVerificationResendTimer';
import { useLinkSMS, useLoginWithSMS } from '@privy-io/expo';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { CoinbaseAlert } from '../components/ui/CoinbaseAlerts';
import { RegentPressable } from '../components/ui/RegentPressable';
import { setVerifiedPhone } from '../utils/state/verificationState';

const { DARK_BG, CARD_BG, TEXT_PRIMARY, TEXT_SECONDARY, BLUE, WHITE, BORDER } = COLORS;

export default function PhoneCodeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const phone = params.phone as string;
  const mode = (params.mode as 'signin' | 'link' | 'reverify') || 'link';

  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [sending, setSending] = useState(false);
  const [alert, setAlert] = useState<{ visible: boolean; title: string; message: string; type: 'success' | 'error' | 'info' }>({
    visible: false,
    title: '',
    message: '',
    type: 'info',
  });
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { sendCode: sendLoginCode, loginWithCode } = useLoginWithSMS();
  const { sendCode: sendLinkCode, linkWithCode } = useLinkSMS();
  const { regentsUserId } = useRegentsAuth();
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
      if (mode === 'signin' || mode === 'reverify') {
        await sendLoginCode({ phone });
      } else {
        await sendLinkCode({ phone });
      }

      resetResendTimer();
    } catch (error: any) {
      setAlert({
        visible: true,
        title: 'Could not resend the code',
        message: error.message || 'Please try again.',
        type: 'error',
      });
    } finally {
      setSending(false);
    }
  };

  const verifySms = async () => {
    if (!phone || !code) {
      return;
    }
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
      if (mode === 'signin' || mode === 'reverify') {
        const user = await loginWithCode({ phone, code });
        await setVerifiedPhone(phone, user?.id || regentsUserId || undefined);

        if (mode === 'signin') {
          router.replace('/agents');
        } else {
          setAlert({
            visible: true,
            title: 'Phone ready',
            message: 'Your phone is ready to use again.',
            type: 'success',
          });
          scheduleDismiss(() => router.dismissAll());
        }
      } else {
        const user = await linkWithCode({ phone, code });
        await setVerifiedPhone(phone, user?.id || regentsUserId || undefined);
        setAlert({
          visible: true,
          title: 'Phone added',
          message: 'Your phone is ready to use.',
          type: 'success',
        });
        scheduleDismiss(() => router.dismissAll());
      }
    } catch (error: any) {
      setAlert({
        visible: true,
        title: 'That code did not work',
        message: error.message || 'Please try again.',
        type: 'error',
      });
    } finally {
      setVerifying(false);
    }
  };

  const canResend = resendReady && !sending && !verifying;
  const title = mode === 'link' ? 'Confirm your phone' : 'Enter your code';

  return (
    <SafeAreaView style={styles.container}>
      <VerificationMotion style={styles.header}>
        <RegentPressable pressStyle="icon" onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={26} color={TEXT_PRIMARY} />
        </RegentPressable>
      </VerificationMotion>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.content}>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.flow}>
            <View style={styles.centerBlock}>
              <VerificationMotion order={1} variant="screen">
                <Text style={styles.title}>{title}</Text>
              </VerificationMotion>

              <VerificationMotion order={2} variant="screen">
                <Text style={styles.subtitle}>We sent a short code to {phone}.</Text>
              </VerificationMotion>

              <VerificationMotion
                order={3}
                style={styles.codeCard}
              >
                <TextInput
                  style={styles.codeInput}
                  value={code}
                  onChangeText={setCode}
                  placeholder="Enter code"
                  placeholderTextColor={TEXT_SECONDARY}
                  textContentType="oneTimeCode"
                  autoComplete="one-time-code"
                  keyboardType="number-pad"
                  maxLength={6}
                  editable={!verifying}
                  autoFocus
                />
              </VerificationMotion>
            </View>

            <View style={styles.footerBlock}>
              <VerificationMotion
                order={4}
                style={styles.buttonWrap}
              >
                <RegentPressable
                  style={[styles.continueButton, (verifying || code.length < 4) && styles.disabledButton]}
                  onPress={verifySms}
                  disabled={verifying || code.length < 4}
                >
                  {verifying ? <ActivityIndicator color={WHITE} /> : <Text style={styles.continueButtonText}>Continue</Text>}
                </RegentPressable>
              </VerificationMotion>

              <VerificationMotion
                order={5}
                style={styles.resendContainer}
              >
                {resendSeconds > 0 ? (
                  <Text style={styles.resendText}>Resend in {resendSeconds}s</Text>
                ) : (
                  <RegentPressable pressStyle="none" onPress={resendCode} disabled={!canResend}>
                    <Text style={[styles.resendButton, !canResend && styles.disabledText]}>Resend code</Text>
                  </RegentPressable>
                )}
              </VerificationMotion>
            </View>
          </View>
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
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  backButton: {
    alignSelf: 'flex-start',
    padding: 8,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 28,
  },
  flow: {
    flex: 1,
    justifyContent: 'space-between',
    paddingTop: 32,
  },
  centerBlock: {
    alignItems: 'center',
    gap: 18,
    marginTop: 88,
  },
  title: {
    color: TEXT_PRIMARY,
    fontSize: 34,
    lineHeight: 40,
    textAlign: 'center',
    fontFamily: FONTS.heading,
  },
  subtitle: {
    color: TEXT_SECONDARY,
    fontSize: 18,
    lineHeight: 24,
    textAlign: 'center',
    fontFamily: FONTS.body,
  },
  codeCard: {
    width: '100%',
    minHeight: 92,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 18,
    backgroundColor: CARD_BG,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  codeInput: {
    color: TEXT_PRIMARY,
    fontSize: 26,
    lineHeight: 32,
    textAlign: 'center',
    letterSpacing: 6,
    fontFamily: FONTS.heading,
  },
  footerBlock: {
    gap: 20,
  },
  buttonWrap: {
    width: '100%',
  },
  continueButton: {
    width: '100%',
    minHeight: 62,
    borderRadius: 18,
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  continueButtonText: {
    color: WHITE,
    fontSize: 18,
    lineHeight: 24,
    fontFamily: FONTS.body,
  },
  disabledButton: {
    opacity: 0.5,
  },
  resendContainer: {
    alignItems: 'center',
  },
  resendText: {
    color: TEXT_SECONDARY,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: FONTS.body,
  },
  resendButton: {
    color: BLUE,
    fontSize: 16,
    lineHeight: 22,
    fontFamily: FONTS.body,
  },
  disabledText: {
    opacity: 0.4,
  },
});
