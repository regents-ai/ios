import { useRegentsAuth } from '@/hooks/useRegentsAuth';
import { useLinkSMS, useLoginWithSMS } from '@privy-io/expo';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { CoinbaseAlert } from '../components/ui/CoinbaseAlerts';
import { COLORS } from '../constants/Colors';
import { TEST_ACCOUNTS } from '../constants/TestAccounts';
import { setCurrentSolanaAddress, setCurrentWalletAddress, setTestSession, setVerifiedPhone } from '../utils/sharedState';

const { DARK_BG, CARD_BG, TEXT_PRIMARY, TEXT_SECONDARY, BLUE, WHITE } = COLORS;
const RESEND_SECONDS = 30;

export default function PhoneCodeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const phone = params.phone as string;
  const mode = (params.mode as 'signin' | 'link' | 'reverify') || 'link';

  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [sending, setSending] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(RESEND_SECONDS);
  const [alert, setAlert] = useState<{visible:boolean; title:string; message:string; type:'success'|'error'|'info'}>({
    visible:false, title:'', message:'', type:'info'
  });

  const { sendCode: sendLoginCode, loginWithCode } = useLoginWithSMS();
  const { sendCode: sendLinkCode, linkWithCode } = useLinkSMS();
  const { regentsUserId } = useRegentsAuth();

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = setInterval(() => setResendSeconds(value => value - 1), 1000);
    return () => clearInterval(timer);
  }, [resendSeconds]);

  const resendCode = async () => {
    if (phone === TEST_ACCOUNTS.phone) {
      setResendSeconds(RESEND_SECONDS);
      return;
    }

    setSending(true);
    try {
      if (mode === 'signin' || mode === 'reverify') {
        await sendLoginCode({ phone });
      } else {
        await sendLinkCode({ phone });
      }

      setResendSeconds(RESEND_SECONDS);
    } catch (error: any) {
      setAlert({
        visible: true,
        title: 'Unable to resend code',
        message: error.message || 'Please try again.',
        type: 'error',
      });
    } finally {
      setSending(false);
    }
  };

  const verifySms = async () => {
    if (!phone || !code) return;
    setVerifying(true);

    try {
      if (phone === TEST_ACCOUNTS.phone) {
        if (code !== TEST_ACCOUNTS.smsCode) {
          throw new Error(`Test SMS code must be: ${TEST_ACCOUNTS.smsCode}`);
        }

        if (mode === 'signin') {
          await setTestSession(TEST_ACCOUNTS.wallets.evm, TEST_ACCOUNTS.wallets.solana);
          setCurrentWalletAddress(TEST_ACCOUNTS.wallets.evm);
          setCurrentSolanaAddress(TEST_ACCOUNTS.wallets.solana);
          await setVerifiedPhone(phone, TEST_ACCOUNTS.userId);
          router.replace('/wallet');
          return;
        }

        await setVerifiedPhone(phone, TEST_ACCOUNTS.userId);
        setAlert({
          visible: true,
          title: mode === 'reverify' ? 'Phone ready' : 'Phone linked',
          message: mode === 'reverify'
            ? 'Your phone is ready for checkout again.'
            : 'Your phone number has been linked to your account.',
          type: 'success',
        });
        setTimeout(() => router.dismissAll(), 1500);
        return;
      }

      if (mode === 'signin' || mode === 'reverify') {
        const user = await loginWithCode({ phone, code });
        await setVerifiedPhone(phone, user?.id || regentsUserId || undefined);

        if (mode === 'signin') {
          router.replace('/wallet');
        } else {
          setAlert({
            visible: true,
            title: 'Phone ready',
            message: 'Your phone is ready for checkout again.',
            type: 'success',
          });
          setTimeout(() => router.dismissAll(), 1500);
        }
      } else {
        const user = await linkWithCode({ phone, code });
        await setVerifiedPhone(phone, user?.id || regentsUserId || undefined);
        setAlert({
          visible: true,
          title: 'Phone linked',
          message: 'Your phone number has been linked to your account.',
          type: 'success',
        });
        setTimeout(() => router.dismissAll(), 1500);
      }
    } catch (error: any) {
      setAlert({
        visible: true,
        title: 'Verification failed',
        message: error.message || 'Please try again.',
        type: 'error',
      });
    } finally {
      setVerifying(false);
    }
  };

  const canResend = resendSeconds <= 0 && !sending && !verifying;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={TEXT_PRIMARY} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.content}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.stepContainer}>
            <Text style={styles.title}>
              {mode === 'signin' ? 'Check your phone' : mode === 'reverify' ? 'Verify your phone' : 'Add your phone'}
            </Text>
            <Text style={styles.subtitle}>
              Enter the code we sent to {phone}.
            </Text>

            <View style={styles.codeInputContainer}>
              <TextInput
                style={styles.codeInput}
                value={code}
                onChangeText={setCode}
                textContentType="oneTimeCode"
                autoComplete="sms-otp"
                keyboardType="number-pad"
                maxLength={6}
                editable={!verifying}
                autoFocus
              />
            </View>

            <Pressable
              style={[styles.continueButton, (verifying || code.length < 4) && styles.disabledButton]}
              onPress={verifySms}
              disabled={verifying || code.length < 4}
            >
              {verifying ? <ActivityIndicator color={WHITE} /> : <Text style={styles.continueButtonText}>Verify</Text>}
            </Pressable>

            <View style={styles.resendContainer}>
              {resendSeconds > 0 ? (
                <Text style={styles.resendText}>You can resend in {resendSeconds}s</Text>
              ) : (
                <Pressable onPress={resendCode} disabled={!canResend}>
                  <Text style={[styles.resendButton, !canResend && styles.disabledText]}>Resend code</Text>
                </Pressable>
              )}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <CoinbaseAlert
        visible={alert.visible}
        title={alert.title}
        message={alert.message}
        type={alert.type}
        onConfirm={() => setAlert(current => ({ ...current, visible: false }))}
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  backButton: {
    padding: 8,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  stepContainer: {
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    textAlign: 'center',
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 16,
    color: TEXT_SECONDARY,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 40,
    paddingHorizontal: 20,
  },
  codeInputContainer: {
    marginBottom: 32,
    width: '100%',
  },
  codeInput: {
    backgroundColor: CARD_BG,
    borderWidth: 2,
    borderColor: BLUE,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 20,
    fontSize: 28,
    color: TEXT_PRIMARY,
    textAlign: 'center',
    letterSpacing: 8,
  },
  continueButton: {
    backgroundColor: BLUE,
    borderRadius: 25,
    paddingVertical: 16,
    paddingHorizontal: 32,
    width: '100%',
    alignItems: 'center',
  },
  continueButtonText: {
    color: WHITE,
    fontSize: 16,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.5,
  },
  resendContainer: {
    marginTop: 24,
  },
  resendText: {
    color: TEXT_SECONDARY,
    fontSize: 14,
  },
  resendButton: {
    color: BLUE,
    fontSize: 14,
    fontWeight: '600',
  },
  disabledText: {
    opacity: 0.4,
  },
});
