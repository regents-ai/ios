import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import { useRegentsAuth } from '@/hooks/useRegentsAuth';
import { useLinkSMS, useLoginWithSMS } from '@privy-io/expo';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { EaseView } from 'react-native-ease';
import { AccessibilityInfo, ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { CoinbaseAlert } from '../components/ui/CoinbaseAlerts';
import { TEST_ACCOUNTS } from '../constants/TestAccounts';
import { PHONE_COUNTRIES } from '../constants/PhoneCountries';

const { DARK_BG, CARD_BG, TEXT_PRIMARY, TEXT_SECONDARY, BORDER, BLUE, WHITE } = COLORS;
const SCREEN_OFFSET = 12;
const CARD_OFFSET = 8;
const STAGGER_STEP = 50;

function buildEntryTransition(reduceMotion: boolean, delay = 0, duration = 220) {
  return reduceMotion
    ? { type: 'none' as const }
    : { type: 'timing' as const, duration, easing: 'easeOut' as const, delay };
}

export default function PhoneVerifyScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const initialPhone = (params.initialPhone as string) || '';
  const mode = (params.mode as 'signin' | 'link' | 'reverify') || 'link';
  const autoSend = params.autoSend === 'true';

  const [selectedCountry, setSelectedCountry] = useState(PHONE_COUNTRIES[0]);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [sending, setSending] = useState(false);
  const [countryPickerVisible, setCountryPickerVisible] = useState(false);
  const [hasAutoSent, setHasAutoSent] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [alert, setAlert] = useState<{ visible: boolean; title: string; message: string; type: 'success' | 'error' | 'info' }>({
    visible: false,
    title: '',
    message: '',
    type: 'info',
  });

  const { isAuthenticated } = useRegentsAuth();
  const { sendCode: sendLoginCode } = useLoginWithSMS();
  const { sendCode: sendLinkCode } = useLinkSMS();

  useEffect(() => {
    if (!initialPhone) {
      return;
    }

    const country = PHONE_COUNTRIES.find((item) => initialPhone.startsWith(item.code));
    if (!country) {
      return;
    }

    setSelectedCountry(country);
    setPhoneNumber(initialPhone.slice(country.code.length));
  }, [initialPhone]);

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

  const handlePhoneChange = (input: string) => {
    setPhoneNumber(input.replace(/\D/g, ''));
  };

  const phoneE164 = phoneNumber ? `${selectedCountry.code}${phoneNumber}` : '';
  const isPhoneValid = phoneNumber.length >= selectedCountry.minDigits;

  const startSms = useCallback(async () => {
    if (!isPhoneValid) {
      setAlert({
        visible: true,
        title: 'Enter a phone number',
        message: `Use at least ${selectedCountry.minDigits} digits for ${selectedCountry.name}.`,
        type: 'error',
      });
      return;
    }

    if (mode === 'link' && !isAuthenticated) {
      setAlert({
        visible: true,
        title: 'Sign in first',
        message: 'Sign in before you add a phone number.',
        type: 'error',
      });
      return;
    }

    setSending(true);
    try {
      if (phoneE164 === TEST_ACCOUNTS.phone) {
        router.push({
          pathname: '/phone-code',
          params: { phone: phoneE164, mode },
        });
        return;
      }

      if (mode === 'signin' || mode === 'reverify') {
        await sendLoginCode({ phone: phoneE164 });
      } else {
        await sendLinkCode({ phone: phoneE164 });
      }

      router.push({
        pathname: '/phone-code',
        params: { phone: phoneE164, mode },
      });
    } catch (error: any) {
      setAlert({
        visible: true,
        title: 'Could not send the code',
        message: error.message || 'Please try again.',
        type: 'error',
      });
    } finally {
      setSending(false);
    }
  }, [isAuthenticated, isPhoneValid, mode, phoneE164, router, selectedCountry.minDigits, selectedCountry.name, sendLinkCode, sendLoginCode]);

  useEffect(() => {
    const shouldAutoSend = (mode === 'reverify' && initialPhone && isAuthenticated) || (autoSend && initialPhone);
    if (!shouldAutoSend || !isPhoneValid || hasAutoSent || sending) {
      return;
    }

    setHasAutoSent(true);
    startSms();
  }, [autoSend, hasAutoSent, initialPhone, isAuthenticated, isPhoneValid, mode, sending, startSms]);

  const title = mode === 'link' ? 'Add your phone' : 'Verify your phone';
  const subtitle = mode === 'signin' ? 'Use a number you can access now.' : mode === 'reverify' ? 'Use the number you want to keep.' : 'Use a number you can access now.';
  const helperText = selectedCountry.code === '+1' ? '' : 'Apple Pay works with US phone numbers today.';

  return (
    <SafeAreaView style={styles.container}>
      <EaseView
        initialAnimate={{ opacity: 0, translateY: CARD_OFFSET }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={buildEntryTransition(reduceMotion)}
        style={styles.header}
      >
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}>
          <Ionicons name="arrow-back" size={26} color={TEXT_PRIMARY} />
        </Pressable>
      </EaseView>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.content}>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.flow}>
            <View style={styles.centerBlock}>
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
                style={styles.fieldShell}
              >
                <View style={styles.fieldRow}>
                  <Pressable
                    style={({ pressed }) => [styles.countryButton, pressed && styles.countryButtonPressed]}
                    onPress={() => setCountryPickerVisible((current) => !current)}
                  >
                    <Text style={styles.countryFlag}>{selectedCountry.flag}</Text>
                    <Text style={styles.countryCode}>{selectedCountry.code}</Text>
                    <Ionicons name={countryPickerVisible ? 'chevron-up' : 'chevron-down'} size={18} color={TEXT_SECONDARY} />
                  </Pressable>

                  <View style={styles.fieldDivider} />

                  <View style={styles.phoneInputWrap}>
                    <Ionicons name="phone-portrait-outline" size={20} color={TEXT_SECONDARY} />
                    <TextInput
                      style={styles.phoneInput}
                      value={phoneNumber}
                      onChangeText={handlePhoneChange}
                      placeholder="Phone number"
                      placeholderTextColor={TEXT_SECONDARY}
                      keyboardType="phone-pad"
                      autoFocus
                      editable={!sending}
                    />
                  </View>
                </View>

                {countryPickerVisible ? (
                  <EaseView
                    initialAnimate={{ opacity: 0, translateY: CARD_OFFSET }}
                    animate={{ opacity: 1, translateY: 0 }}
                    transition={buildEntryTransition(reduceMotion, 0, 180)}
                    style={styles.countryList}
                  >
                    {PHONE_COUNTRIES.map((country) => (
                      <Pressable
                        key={country.code}
                        style={({ pressed }) => [styles.countryRow, pressed && styles.countryRowPressed]}
                        onPress={() => {
                          setSelectedCountry(country);
                          setCountryPickerVisible(false);
                        }}
                      >
                        <Text style={styles.countryRowFlag}>{country.flag}</Text>
                        <View style={styles.countryRowCopy}>
                          <Text style={styles.countryRowName}>{country.name}</Text>
                          <Text style={styles.countryRowCode}>{country.code}</Text>
                        </View>
                      </Pressable>
                    ))}
                  </EaseView>
                ) : null}
              </EaseView>

              {helperText ? (
                <EaseView
                  initialAnimate={{ opacity: 0, translateY: CARD_OFFSET }}
                  animate={{ opacity: 1, translateY: 0 }}
                  transition={buildEntryTransition(reduceMotion, STAGGER_STEP * 4)}
                >
                  <Text style={styles.helperText}>{helperText}</Text>
                </EaseView>
              ) : null}
            </View>

            <EaseView
              initialAnimate={{ opacity: 0, translateY: CARD_OFFSET }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={buildEntryTransition(reduceMotion, STAGGER_STEP * 5)}
              style={styles.buttonWrap}
            >
              <Pressable
                style={({ pressed }) => [
                  styles.continueButton,
                  (!isPhoneValid || sending) && styles.disabledButton,
                  pressed && isPhoneValid && !sending && styles.buttonPressed,
                ]}
                onPress={startSms}
                disabled={!isPhoneValid || sending}
              >
                {sending ? <ActivityIndicator color={WHITE} /> : <Text style={styles.continueButtonText}>Continue</Text>}
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
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
  },
  backButtonPressed: {
    opacity: 0.6,
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
    marginTop: 72,
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
  fieldShell: {
    width: '100%',
    gap: 12,
  },
  fieldRow: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 18,
    backgroundColor: CARD_BG,
    flexDirection: 'row',
    alignItems: 'stretch',
    overflow: 'hidden',
  },
  countryButton: {
    width: 146,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  countryButtonPressed: {
    opacity: 0.75,
  },
  countryFlag: {
    fontSize: 28,
    lineHeight: 32,
  },
  countryCode: {
    color: TEXT_PRIMARY,
    fontSize: 18,
    lineHeight: 24,
    fontFamily: FONTS.body,
  },
  fieldDivider: {
    width: 1,
    backgroundColor: BORDER,
  },
  phoneInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
  },
  phoneInput: {
    flex: 1,
    color: TEXT_PRIMARY,
    fontSize: 18,
    lineHeight: 24,
    fontFamily: FONTS.body,
  },
  countryList: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 18,
    backgroundColor: CARD_BG,
    overflow: 'hidden',
    maxHeight: 360,
  },
  countryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 18,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  countryRowPressed: {
    opacity: 0.8,
  },
  countryRowFlag: {
    fontSize: 24,
    lineHeight: 28,
  },
  countryRowCopy: {
    flex: 1,
  },
  countryRowName: {
    color: TEXT_PRIMARY,
    fontSize: 16,
    lineHeight: 22,
    fontFamily: FONTS.body,
  },
  countryRowCode: {
    color: TEXT_SECONDARY,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONTS.body,
  },
  helperText: {
    color: TEXT_SECONDARY,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    fontFamily: FONTS.body,
  },
  buttonWrap: {
    width: '100%',
  },
  continueButton: {
    width: '100%',
    minHeight: 64,
    borderRadius: 18,
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    alignSelf: 'stretch',
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
  buttonPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
});
