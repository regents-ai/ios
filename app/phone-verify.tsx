import { VerificationMotion } from '@/components/auth/verification-motion';
import { StatusBanner, type StatusBannerState } from '@/components/ui/StatusBanner';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { useChatGptAuth } from '@/hooks/useChatGptAuth';
import { useRegentsAuth } from '@/hooks/useRegentsAuth';
import { shouldInterceptForwardNavigation } from '@/utils/onboardingGate';
import { useLinkSMS, useLoginWithSMS } from '@privy-io/expo';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { RegentPressable } from '../components/ui/RegentPressable';
import { PHONE_COUNTRIES } from '../constants/PhoneCountries';

export default function PhoneVerifyScreen() {
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);
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
  const [banner, setBanner] = useState<{ state: StatusBannerState; message: string } | null>(null);

  const { isAuthenticated } = useRegentsAuth();
  const { isReady: isChatGptReady, session: chatGptSession } = useChatGptAuth();
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
    if (isChatGptReady && !chatGptSession) {
      router.replace('/auth/login');
    }
  }, [chatGptSession, isChatGptReady, router]);

  const handlePhoneChange = (input: string) => {
    setPhoneNumber(input.replace(/\D/g, ''));
  };

  const phoneE164 = phoneNumber ? `${selectedCountry.code}${phoneNumber}` : '';
  const isPhoneValid = phoneNumber.length >= selectedCountry.minDigits;

  const startSms = useCallback(async () => {
    if (!isChatGptReady || !chatGptSession) {
      setBanner({ state: 'error', message: 'Finish ChatGPT sign-in before you continue.' });
      return;
    }

    if (!isPhoneValid) {
      setBanner({
        state: 'error',
        message: `Use at least ${selectedCountry.minDigits} digits for ${selectedCountry.name}.`,
      });
      return;
    }

    if (mode === 'link' && !isAuthenticated) {
      setBanner({ state: 'error', message: 'Sign in before you add a phone number.' });
      return;
    }

    setSending(true);
    setBanner({ state: 'working', message: 'Sending your code…' });
    try {
      if (mode === 'signin' || mode === 'reverify') {
        await sendLoginCode({ phone: phoneE164 });
      } else {
        await sendLinkCode({ phone: phoneE164 });
      }

      setBanner({ state: 'success', message: `Code sent to ${phoneE164}.` });

      // The code-entry screen only opens once the code really went out.
      const intercept = shouldInterceptForwardNavigation({
        from: '/phone-verify',
        to: '/phone-code',
        hasCompletedCriticalAction: true,
        hasBypassed: false,
      });
      if (!intercept) {
        router.push({
          pathname: '/phone-code',
          params: { phone: phoneE164, mode },
        });
      }
    } catch (error: any) {
      setBanner({ state: 'error', message: error.message || 'We could not send the code. Please try again.' });
    } finally {
      setSending(false);
    }
  }, [chatGptSession, isAuthenticated, isChatGptReady, isPhoneValid, mode, phoneE164, router, selectedCountry.minDigits, selectedCountry.name, sendLinkCode, sendLoginCode]);

  useEffect(() => {
    const shouldAutoSend = ((mode === 'reverify' && initialPhone && isAuthenticated) || (autoSend && initialPhone)) && !!chatGptSession;
    if (!shouldAutoSend || !isPhoneValid || hasAutoSent || sending) {
      return;
    }

    setHasAutoSent(true);
    startSms();
  }, [autoSend, chatGptSession, hasAutoSent, initialPhone, isAuthenticated, isPhoneValid, mode, sending, startSms]);

  const title = mode === 'link' ? 'Add your phone' : 'Verify your phone';
  const subtitle = mode === 'signin' ? 'Use a number you can access now.' : mode === 'reverify' ? 'Use the number you want to keep.' : 'Use a number you can access now.';
  const helperText = selectedCountry.code === '+1' ? '' : 'Apple Pay works with US phone numbers today.';

  return (
    <SafeAreaView style={styles.container}>
      <VerificationMotion style={styles.header}>
        <RegentPressable pressStyle="icon" onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={26} color={colors.text} />
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
                <Text style={styles.subtitle}>{subtitle}</Text>
              </VerificationMotion>

              <VerificationMotion
                order={3}
                style={styles.fieldShell}
              >
                <View style={styles.fieldRow}>
                  <RegentPressable
                    haptic="selection"
                    pressStyle="chip"
                    style={styles.countryButton}
                    onPress={() => setCountryPickerVisible((current) => !current)}
                  >
                    <Text style={styles.countryFlag}>{selectedCountry.flag}</Text>
                    <Text style={styles.countryCode}>{selectedCountry.code}</Text>
                    <Ionicons name={countryPickerVisible ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
                  </RegentPressable>

                  <View style={styles.fieldDivider} />

                  <View style={styles.phoneInputWrap}>
                    <Ionicons name="phone-portrait-outline" size={20} color={colors.textMuted} />
                    <TextInput
                      style={styles.phoneInput}
                      value={phoneNumber}
                      onChangeText={handlePhoneChange}
                      placeholder="Phone number"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="phone-pad"
                      autoFocus
                      editable={!sending}
                    />
                  </View>
                </View>

                {countryPickerVisible ? (
                  <VerificationMotion style={styles.countryList}>
                    {PHONE_COUNTRIES.map((country) => (
                      <RegentPressable
                        key={country.code}
                        haptic="selection"
                        pressStyle="card"
                        style={styles.countryRow}
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
                      </RegentPressable>
                    ))}
                  </VerificationMotion>
                ) : null}
              </VerificationMotion>

              {helperText ? (
                <VerificationMotion order={4}>
                  <Text style={styles.helperText}>{helperText}</Text>
                </VerificationMotion>
              ) : null}
            </View>

            <VerificationMotion
              order={5}
              style={styles.buttonWrap}
            >
              {banner ? (
                <View style={styles.bannerWrap}>
                  <StatusBanner state={banner.state} message={banner.message} />
                </View>
              ) : null}
              <RegentPressable
                style={[styles.continueButton, (!isPhoneValid || sending) && styles.disabledButton]}
                onPress={startSms}
                disabled={!isPhoneValid || sending}
              >
                {sending ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.continueButtonText}>Continue</Text>}
              </RegentPressable>
            </VerificationMotion>
          </View>
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
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
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
    color: colors.text,
    fontSize: 34,
    lineHeight: 40,
    textAlign: 'center',
    fontFamily: fonts.title,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 18,
    lineHeight: 24,
    textAlign: 'center',
    fontFamily: fonts.ui,
  },
  fieldShell: {
    width: '100%',
    gap: 12,
  },
  fieldRow: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    borderRadius: 18,
    backgroundColor: colors.surfaceElevated,
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
  countryFlag: {
    fontSize: 28,
    lineHeight: 32,
  },
  countryCode: {
    color: colors.text,
    fontSize: 18,
    lineHeight: 24,
    fontFamily: fonts.ui,
  },
  fieldDivider: {
    width: 1,
    backgroundColor: colors.hairlineStrong,
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
    color: colors.text,
    fontSize: 18,
    lineHeight: 24,
    fontFamily: fonts.ui,
  },
  countryList: {
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    borderRadius: 18,
    backgroundColor: colors.surfaceElevated,
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
    borderBottomColor: colors.hairlineStrong,
  },
  countryRowFlag: {
    fontSize: 24,
    lineHeight: 28,
  },
  countryRowCopy: {
    flex: 1,
  },
  countryRowName: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 22,
    fontFamily: fonts.ui,
  },
  countryRowCode: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.ui,
  },
  helperText: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    fontFamily: fonts.ui,
  },
  buttonWrap: {
    width: '100%',
  },
  bannerWrap: {
    marginBottom: 12,
  },
  continueButton: {
    width: '100%',
    minHeight: 64,
    borderRadius: 18,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    alignSelf: 'stretch',
  },
  continueButtonText: {
    color: colors.onAccent,
    fontSize: 18,
    lineHeight: 24,
    fontFamily: fonts.ui,
  },
  disabledButton: {
    opacity: 0.5,
  },
  });
}
