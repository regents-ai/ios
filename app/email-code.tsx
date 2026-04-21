import { useLinkEmail, useLoginWithEmail } from '@privy-io/expo';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { CoinbaseAlert } from '../components/ui/CoinbaseAlerts';
import { COLORS } from '../constants/Colors';
import { isTestAccount, TEST_ACCOUNTS } from '../constants/TestAccounts';
import { getVerificationSuccessAction } from '../utils/authFlowState';
import { setTestSession } from '../utils/state/reviewSessionState';
import { setCurrentSolanaAddress, setCurrentWalletAddress } from '../utils/state/walletRuntimeState';

const { DARK_BG, CARD_BG, TEXT_PRIMARY, TEXT_SECONDARY, BLUE, WHITE } = COLORS;
const RESEND_SECONDS = 30;

export default function EmailCodeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const email = params.email as string;
  const mode = (params.mode as 'signin' | 'link') || 'signin'; // Default to signin for new flow

  const [otp, setOtp] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [sending, setSending] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(RESEND_SECONDS);
  const [alert, setAlert] = useState<{visible:boolean; title:string; message:string; type:'success'|'error'|'info'}>({
    visible:false, title:'', message:'', type:'info'
  });

  const { sendCode: sendLoginCode, loginWithCode } = useLoginWithEmail();
  const { sendCode: sendLinkCode, linkWithCode } = useLinkEmail();

  const canResend = resendSeconds <= 0 && !sending && !verifying;

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const t = setInterval(() => setResendSeconds(s => s - 1), 1000);
    return () => clearInterval(t);
  }, [resendSeconds]);

  const resendCode = async () => {
    // Skip resend for test accounts
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
    } catch (e: any) {
      setAlert({
        visible: true,
        title: 'Unable to resend code',
        message: e.message || 'Please try again.',
        type: 'error'
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
          throw new Error(`Test account OTP must be: ${TEST_ACCOUNTS.otp}`);
        }

        await setTestSession(TEST_ACCOUNTS.wallets.evm, TEST_ACCOUNTS.wallets.solana);
        setCurrentWalletAddress(TEST_ACCOUNTS.wallets.evm);
        setCurrentSolanaAddress(TEST_ACCOUNTS.wallets.solana);
        const nextAction = getVerificationSuccessAction(mode);
        if (nextAction === 'go_wallet') {
          router.replace('/wallet');
        } else {
          router.dismissAll();
        }
        return;
      }

      if (mode === 'signin') {
        await loginWithCode({ email, code: otp });
        const nextAction = getVerificationSuccessAction(mode);
        if (nextAction === 'go_wallet') {
          router.replace('/wallet');
        } else {
          router.dismissAll();
        }
      } else {
        await linkWithCode({ email, code: otp });

        setAlert({
          visible: true,
          title: 'Email Verified',
          message: 'Your email address has been linked to your account.',
          type: 'success'
        });
        setTimeout(() => {
          const nextAction = getVerificationSuccessAction(mode);
          if (nextAction === 'go_wallet') {
            router.replace('/wallet');
          } else {
            router.dismissAll();
          }
        }, 1500);
      }
    } catch (e: any) {
      setAlert({
        visible: true,
        title: 'Verification Failed',
        message: e.message || 'Invalid code. Please try again.',
        type: 'error'
      });
    } finally {
      setVerifying(false);
    }
  };

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
              {mode === 'signin' ? 'Check your email' : 'Link your email'}
            </Text>
            <Text style={styles.subtitle}>
              {mode === 'signin'
                ? `Please enter the verification code we sent to ${email}`
                : `Please enter the verification code we sent to ${email} to link this email.`}
            </Text>

            <View style={styles.codeInputContainer}>
              <TextInput
                style={styles.codeInput}
                value={otp}
                onChangeText={setOtp}
                placeholder=""
                textContentType="oneTimeCode"
                autoComplete="sms-otp"
                keyboardType="number-pad"
                maxLength={6}
                editable={!verifying}
                selectTextOnFocus={true}
                autoFocus
              />
            </View>

            <Pressable
              style={[styles.continueButton, (verifying || otp.length < 4) && styles.disabledButton]}
              onPress={verifyEmail}
              disabled={verifying || otp.length < 4}
            >
              {verifying ? (
                <ActivityIndicator color={WHITE} />
              ) : (
                <Text style={styles.continueButtonText}>Verify</Text>
              )}
            </Pressable>

            <View style={styles.resendContainer}>
              {resendSeconds > 0 ? (
                <Text style={styles.resendText}>You can resend in {resendSeconds}s</Text>
              ) : (
                <Pressable onPress={resendCode} disabled={!canResend}>
                  <Text style={[styles.resendButton, !canResend && styles.disabledText]}>
                    Resend code
                  </Text>
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
        onConfirm={() => setAlert(a => ({ ...a, visible:false }))}
      />
    </SafeAreaView>
  );
}

// Use the same styles as phone-code.tsx
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
    marginRight: 8,
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
    fontSize: 24,
    color: TEXT_PRIMARY,
    textAlign: 'center',
    letterSpacing: 8,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  continueButton: {
    backgroundColor: BLUE,
    borderRadius: 25,
    paddingVertical: 16,
    paddingHorizontal: 32,
    width: '100%',
    alignItems: 'center',
    shadowColor: BLUE,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  continueButtonText: {
    color: WHITE,
    fontSize: 18,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.5,
  },
  resendContainer: {
    marginTop: 24,
    alignItems: 'center',
  },
  resendText: {
    color: TEXT_SECONDARY,
    fontSize: 14,
  },
  resendButton: {
    color: BLUE,
    fontSize: 16,
    fontWeight: '600',
  },
  disabledText: {
    color: TEXT_SECONDARY,
  },
});
