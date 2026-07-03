import { VerificationMotion } from '@/components/auth/verification-motion';
import { RegentPressable } from '@/components/ui/RegentPressable';
import { StatusBanner, type StatusBannerState } from '@/components/ui/StatusBanner';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { useChatGptAuth } from '@/hooks/useChatGptAuth';
import { useRegentsAuth } from '@/hooks/useRegentsAuth';
import { shouldInterceptForwardNavigation } from '@/utils/onboardingGate';
import { useLinkEmail, useLoginWithEmail } from '@privy-io/expo';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
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

export default function EmailVerifyScreen() {
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const router = useRouter();
  const params = useLocalSearchParams();
  const initialEmail = (params.initialEmail as string) || '';
  const mode = (params.mode as 'signin' | 'link') || 'signin';

  const [email, setEmail] = useState(initialEmail);
  const [sending, setSending] = useState(false);
  const [banner, setBanner] = useState<{ state: StatusBannerState; message: string } | null>(null);

  const { sendCode: sendLoginCode } = useLoginWithEmail();
  const { sendCode: sendLinkCode } = useLinkEmail();
  const { isAuthenticated } = useRegentsAuth();
  const { isReady: isChatGptReady, session: chatGptSession } = useChatGptAuth();

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  React.useEffect(() => {
    if (isChatGptReady && !chatGptSession) {
      router.replace('/auth/login');
    }
  }, [chatGptSession, isChatGptReady, router]);

  const startEmailVerification = async () => {
    if (!isChatGptReady || !chatGptSession) {
      setBanner({ state: 'error', message: 'Finish ChatGPT sign-in before you continue.' });
      return;
    }

    if (!isEmailValid) {
      setBanner({ state: 'error', message: 'Please add a valid email address to continue.' });
      return;
    }

    if (mode === 'link' && !isAuthenticated) {
      setBanner({ state: 'error', message: 'Sign in before you add a new email address.' });
      return;
    }

    setSending(true);
    setBanner({ state: 'working', message: 'Sending your code…' });
    try {
      if (mode === 'signin') {
        await sendLoginCode({ email });
      } else {
        await sendLinkCode({ email });
      }

      setBanner({ state: 'success', message: `Code sent to ${email}.` });

      // The code-entry screen only opens once the code really went out.
      const intercept = shouldInterceptForwardNavigation({
        from: '/email-verify',
        to: '/email-code',
        hasCompletedCriticalAction: true,
        hasBypassed: false,
      });
      if (!intercept) {
        router.push({
          pathname: '/email-code',
          params: { email, mode },
        });
      }
    } catch (error: any) {
      setBanner({ state: 'error', message: error.message || 'We could not send the code. Please try again.' });
    } finally {
      setSending(false);
    }
  };

  const title = mode === 'signin' ? 'Verify your email' : 'Add your email';
  const subtitle = mode === 'signin' ? "We'll send a short code." : "We'll send a short code to confirm this email.";

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
              <Text style={styles.subtitle}>{subtitle}</Text>
            </VerificationMotion>

            <VerificationMotion order={3}>
              <Text style={styles.fieldLabel}>Email</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="name@example.com"
                placeholderTextColor={colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!sending}
                autoFocus
              />
            </VerificationMotion>

            <VerificationMotion order={4}>
              <Text style={styles.helperText}>Check your inbox and spam folder for the code.</Text>
            </VerificationMotion>
          </View>

          <VerificationMotion
            order={5}
            style={styles.footer}
          >
            {banner ? (
              <View style={styles.bannerWrap}>
                <StatusBanner state={banner.state} message={banner.message} />
              </View>
            ) : null}
            <RegentPressable
              style={[styles.primaryButton, (!isEmailValid || sending) && styles.disabledButton]}
              onPress={startEmailVerification}
              disabled={!isEmailValid || sending}
            >
              {sending ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.primaryButtonText}>Send code</Text>}
            </RegentPressable>
          </VerificationMotion>
        </ScrollView>
      </KeyboardAvoidingView>
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
    fontSize: 18,
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
  input: {
    minHeight: 60,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 18,
    color: colors.text,
    fontSize: 18,
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
  footer: {
    paddingTop: 24,
  },
  bannerWrap: {
    marginBottom: 12,
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
  });
}
