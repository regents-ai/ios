import { useRegentsAuth } from '@/hooks/useRegentsAuth';
import { useLinkEmail, useLoginWithEmail } from '@privy-io/expo';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { EaseView } from 'react-native-ease';
import { AccessibilityInfo, ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { CoinbaseAlert } from '../components/ui/CoinbaseAlerts';
import { COLORS } from '../constants/Colors';

const { DARK_BG, CARD_BG, TEXT_PRIMARY, TEXT_SECONDARY, BLUE, WHITE } = COLORS;
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
  const initialEmail = params.initialEmail as string || '';
  const mode = (params.mode as 'signin' | 'link') || 'signin'; // Default to signin for new flow

  const [email, setEmail] = useState(initialEmail);
  const [sending, setSending] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [alert, setAlert] = useState<{visible:boolean; title:string; message:string; type:'success'|'error'|'info'}>({
    visible:false, title:'', message:'', type:'info'
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
      setAlert({ visible:true, title:'Error', message:'Please enter a valid email address', type:'error' });
      return;
    }

    if (mode === 'link' && !isAuthenticated) {
      setAlert({
        visible: true,
        title: 'Sign in first',
        message: 'Sign in before adding an email address.',
        type: 'error'
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
        params: { email, mode }
      });
    } catch (e: any) {
      setAlert({
        visible: true,
        title: 'Unable to send code',
        message: e.message || 'Please try again.',
        type: 'error'
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <EaseView
        initialAnimate={{ opacity: 0, translateY: CARD_OFFSET }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={buildEntryTransition(reduceMotion)}
        style={styles.header}
      >
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={TEXT_PRIMARY} />
        </Pressable>
      </EaseView>

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
            <EaseView
              initialAnimate={{ opacity: 0, translateY: SCREEN_OFFSET }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={buildEntryTransition(reduceMotion, STAGGER_STEP)}
            >
              <Text style={styles.title}>
                {mode === 'signin' ? 'Sign in with email' : 'Link your email'}
              </Text>
            </EaseView>
            <EaseView
              initialAnimate={{ opacity: 0, translateY: SCREEN_OFFSET }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={buildEntryTransition(reduceMotion, STAGGER_STEP * 2)}
            >
              <Text style={styles.subtitle}>
                {mode === 'signin'
                  ? "We'll send you a verification code to sign in and access your wallet."
                  : "We'll send you a verification code to link your email. This helps unlock faster checkout."}
              </Text>
            </EaseView>

            <EaseView
              initialAnimate={{ opacity: 0, translateY: CARD_OFFSET }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={buildEntryTransition(reduceMotion, STAGGER_STEP * 3)}
              style={styles.emailInputContainer}
            >
              <TextInput
                style={styles.emailInput}
                value={email}
                onChangeText={setEmail}
                placeholder="your.email@example.com"
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
              style={styles.buttonWrap}
            >
              <Pressable
                style={[styles.continueButton, (!isEmailValid || sending) && styles.disabledButton]}
                onPress={startEmailVerification}
                disabled={!isEmailValid || sending}
              >
                {sending ? (
                  <ActivityIndicator color={WHITE} />
                ) : (
                  <Text style={styles.continueButtonText}>Continue</Text>
                )}
              </Pressable>
            </EaseView>
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
  emailInputContainer: {
    marginBottom: 32,
    width: '100%',
  },
  buttonWrap: {
    width: '100%',
  },
  emailInput: {
    backgroundColor: CARD_BG,
    borderWidth: 2,
    borderColor: BLUE,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 20,
    fontSize: 18,
    color: TEXT_PRIMARY,
    textAlign: 'center',
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
});
