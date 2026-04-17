import { useRegentsAuth } from '@/hooks/useRegentsAuth';
import { useLinkSMS, useLoginWithSMS } from '@privy-io/expo';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { CoinbaseAlert } from '../components/ui/CoinbaseAlerts';
import { COLORS } from '../constants/Colors';
import { TEST_ACCOUNTS } from '../constants/TestAccounts';
import { PHONE_COUNTRIES } from '../constants/PhoneCountries';

const { DARK_BG, CARD_BG, TEXT_PRIMARY, TEXT_SECONDARY, BORDER, BLUE, WHITE } = COLORS;

export default function PhoneVerifyScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const initialPhone = params.initialPhone as string || '';
  const mode = (params.mode as 'signin' | 'link' | 'reverify') || 'link';
  const autoSend = params.autoSend === 'true';

  const [selectedCountry, setSelectedCountry] = useState(PHONE_COUNTRIES[0]);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [sending, setSending] = useState(false);
  const [countryPickerVisible, setCountryPickerVisible] = useState(false);
  const [hasAutoSent, setHasAutoSent] = useState(false);
  const [alert, setAlert] = useState<{visible:boolean; title:string; message:string; type:'success'|'error'|'info'}>({
    visible:false, title:'', message:'', type:'info'
  });

  const { isAuthenticated } = useRegentsAuth();
  const { sendCode: sendLoginCode } = useLoginWithSMS();
  const { sendCode: sendLinkCode } = useLinkSMS();

  useEffect(() => {
    if (!initialPhone) return;

    const country = PHONE_COUNTRIES.find(item => initialPhone.startsWith(item.code));
    if (!country) return;

    setSelectedCountry(country);
    setPhoneNumber(initialPhone.slice(country.code.length));
  }, [initialPhone]);

  const handlePhoneChange = (input: string) => {
    setPhoneNumber(input.replace(/\D/g, ''));
  };

  const phoneE164 = phoneNumber ? `${selectedCountry.code}${phoneNumber}` : '';
  const isPhoneValid = phoneNumber.length >= selectedCountry.minDigits;

  const startSms = useCallback(async () => {
    if (!isPhoneValid) {
      setAlert({
        visible: true,
        title: 'Phone number needed',
        message: `Enter at least ${selectedCountry.minDigits} digits for ${selectedCountry.name}.`,
        type: 'error',
      });
      return;
    }

    if (mode === 'link' && !isAuthenticated) {
      setAlert({
        visible: true,
        title: 'Sign in first',
        message: 'Sign in before adding a phone number.',
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
        title: 'Unable to send code',
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
              {mode === 'signin' ? 'Sign in with phone' : mode === 'reverify' ? 'Verify your phone' : 'Add your phone'}
            </Text>
            <Text style={styles.subtitle}>
              {mode === 'signin'
                ? 'We will text you a code so you can open your wallet.'
                : 'We will text you a code to confirm this phone number for checkout.'}
            </Text>

            <Pressable style={styles.countrySelector} onPress={() => setCountryPickerVisible(value => !value)}>
              <Text style={styles.countrySelectorText}>{selectedCountry.flag} {selectedCountry.name} ({selectedCountry.code})</Text>
              <Ionicons name={countryPickerVisible ? 'chevron-up' : 'chevron-down'} size={18} color={TEXT_SECONDARY} />
            </Pressable>

            {countryPickerVisible ? (
              <View style={styles.countryList}>
                {PHONE_COUNTRIES.map(country => (
                  <Pressable
                    key={country.code}
                    style={styles.countryRow}
                    onPress={() => {
                      setSelectedCountry(country);
                      setCountryPickerVisible(false);
                    }}
                  >
                    <Text style={styles.countryRowText}>{country.flag} {country.name} ({country.code})</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            <View style={styles.phoneInputContainer}>
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

            <Text style={styles.warningText}>
              Apple Pay checkout is currently limited to US phone numbers, but you can still add another number to your account.
            </Text>

            <Pressable
              style={[styles.continueButton, (!isPhoneValid || sending) && styles.disabledButton]}
              onPress={startSms}
              disabled={!isPhoneValid || sending}
            >
              {sending ? <ActivityIndicator color={WHITE} /> : <Text style={styles.continueButtonText}>Continue</Text>}
            </Pressable>
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
    marginBottom: 32,
    paddingHorizontal: 20,
  },
  countrySelector: {
    width: '100%',
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  countrySelectorText: {
    color: TEXT_PRIMARY,
    fontSize: 16,
  },
  countryList: {
    width: '100%',
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
  },
  countryRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  countryRowText: {
    color: TEXT_PRIMARY,
    fontSize: 15,
  },
  phoneInputContainer: {
    width: '100%',
    marginBottom: 16,
  },
  phoneInput: {
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
  warningText: {
    color: TEXT_SECONDARY,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 28,
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
});
