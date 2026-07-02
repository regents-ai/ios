import { VerificationMotion } from '@/components/auth/verification-motion';
import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import { useChatGptAuth } from '@/hooks/useChatGptAuth';
import { useRegentsAuth } from '@/hooks/useRegentsAuth';
import { useLinkSMS, useLoginWithSMS } from '@privy-io/expo';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { CoinbaseAlert } from '../components/ui/CoinbaseAlerts';
import { RegentPressable } from '../components/ui/RegentPressable';
import { PHONE_COUNTRIES } from '../constants/PhoneCountries';

const { DARK_BG, CARD_BG, TEXT_PRIMARY, TEXT_SECONDARY, BORDER, BLUE, WHITE } = COLORS;

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
  const [alert, setAlert] = useState<{ visible: boolean; title: string; message: string; type: 'success' | 'error' | 'info' }>({
    visible: false,
    title: '',
    message: '',
    type: 'info',
  });

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
      setAlert({
        visible: true,
        title: 'Sign in with ChatGPT',
        message: 'Finish ChatGPT sign-in before you continue.',
        type: 'error',
      });
      return;
    }

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
                    <Ionicons name={countryPickerVisible ? 'chevron-up' : 'chevron-down'} size={18} color={TEXT_SECONDARY} />
                  </RegentPressable>

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
              <RegentPressable
                style={[styles.continueButton, (!isPhoneValid || sending) && styles.disabledButton]}
                onPress={startSms}
                disabled={!isPhoneValid || sending}
              >
                {sending ? <ActivityIndicator color={WHITE} /> : <Text style={styles.continueButtonText}>Continue</Text>}
              </RegentPressable>
            </VerificationMotion>
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
});
