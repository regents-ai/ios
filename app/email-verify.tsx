import { CoinbaseAlert } from '@/components/ui/CoinbaseAlerts';
import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import { useRegentsAuth } from '@/hooks/useRegentsAuth';
import { useLinkEmail, useLoginWithEmail } from '@privy-io/expo';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
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

const { DARK_BG, CARD_BG, TEXT_PRIMARY, TEXT_SECONDARY, BLUE, WHITE, BORDER } = COLORS;
const SCREEN_OFFSET = 12;
const CARD_OFFSET = 8;
const STAGGER_STEP = 50;

function buildEntryTransition(reduceMotion: boolean, delay = 0, duration = 220) {
  return reduceMotion
    ? { type: 'none' as const }
    : { type: 'timing' as const, duration, easing: 'easeOut' as const, delay };
}

export default function EmailVerifyScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const initialEmail = (params.initialEmail as string) || '';
  const mode = (params.mode as 'signin' | 'link') || 'signin';

  const [email, setEmail] = useState(initialEmail);
  const [sending, setSending] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [alert, setAlert] = useState<{ visible: boolean; title: string; message: string; type: 'success' | 'error' | 'info' }>({
    visible: false,
    title: '',
    message: '',
    type: 'info',
  });

  const { sendCode: sendLoginCode } = useLoginWithEmail();
  const { sendCode: sendLinkCode } = useLinkEmail();
  const { isAuthenticated } = useRegentsAuth();

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  React.useEffect(() => {
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

  const startEmailVerification = async () => {
    if (!isEmailValid) {
      setAlert({ visible: true, title: 'Enter an email address', message: 'Please add a valid email address to continue.', type: 'error' });
      return;
    }

    if (mode === 'link' && !isAuthenticated) {
      setAlert({
        visible: true,
        title: 'Sign in first',
        message: 'Sign in before you add a new email address.',
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

      router.push({
        pathname: '/email-code',
        params: { email, mode },
      });
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
              <Text style={styles.subtitle}>{subtitle}</Text>
            </EaseView>

            <EaseView
              initialAnimate={{ opacity: 0, translateY: CARD_OFFSET }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={buildEntryTransition(reduceMotion, STAGGER_STEP * 3)}
            >
              <Text style={styles.fieldLabel}>Email</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="name@example.com"
                placeholderTextColor={TEXT_SECONDARY}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!sending}
                autoFocus
              />
            </EaseView>

            <EaseView
              initialAnimate={{ opacity: 0, translateY: CARD_OFFSET }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={buildEntryTransition(reduceMotion, STAGGER_STEP * 4)}
            >
              <Text style={styles.helperText}>Check your inbox and spam folder for the code.</Text>
            </EaseView>
          </View>

          <EaseView
            initialAnimate={{ opacity: 0, translateY: CARD_OFFSET }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={buildEntryTransition(reduceMotion, STAGGER_STEP * 5)}
            style={styles.footer}
          >
            <Pressable
              style={[styles.primaryButton, (!isEmailValid || sending) && styles.disabledButton]}
              onPress={startEmailVerification}
              disabled={!isEmailValid || sending}
            >
              {sending ? <ActivityIndicator color={WHITE} /> : <Text style={styles.primaryButtonText}>Send code</Text>}
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
    fontSize: 18,
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
  input: {
    minHeight: 60,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD_BG,
    paddingHorizontal: 18,
    color: TEXT_PRIMARY,
    fontSize: 18,
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
});
