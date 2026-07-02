import { CoinbaseAlert } from '@/components/ui/CoinbaseAlerts';
import { AccountManagementSection } from '@/components/settings/AccountManagementSection';
import { HelpSupportSection } from '@/components/settings/HelpSupportSection';
import { PhoneReverifyModal } from '@/components/settings/PhoneReverifyModal';
import { SettingsHero } from '@/components/settings/SettingsHero';
import { SettingsMenu, type SettingsSectionKey } from '@/components/settings/SettingsMenu';
import { SignOutSection } from '@/components/settings/SignOutSection';
import { WalletSettingsSection } from '@/components/settings/WalletSettingsSection';
import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import { useRegentsAuth } from '@/hooks/useRegentsAuth';
import {
  setCountry,
  setSubdivision,
} from '@/utils/state/locationState';
import {
  setCurrentSolanaAddress,
  setCurrentWalletAddress,
} from '@/utils/state/walletRuntimeState';
import {
  daysUntilExpiry,
  getLifetimeTransactionThreshold,
  getVerifiedPhone,
  getVerifiedPhoneUserId,
  isPhoneFresh60d,
  setLifetimeTransactionThreshold,
  setVerifiedPhone,
} from '@/utils/state/verificationState';
import {
  useCurrentUser,
  useEvmAddress,
  useIsInitialized,
  useSignOut,
  useSolanaAddress,
} from '@coinbase/cdp-hooks';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const { DARK_BG, TEXT_SECONDARY, BLUE } = COLORS;

export default function SettingsScreen() {
  const { isInitialized } = useIsInitialized();
  const {
    linkedEmail,
    linkedPhone,
    isAuthenticated,
    regentsUserId,
    signOut: signOutIdentity,
  } = useRegentsAuth();
  const { currentUser } = useCurrentUser();
  const { signOut: signOutWallet } = useSignOut();
  const { evmAddress } = useEvmAddress();
  const { solanaAddress: cdpSolanaAddress } = useSolanaAddress();

  const explicitEOAAddress = currentUser?.evmAccounts?.[0] as string | undefined;
  const smartAccountAddress = currentUser?.evmSmartAccounts?.[0] as string | undefined;
  const solanaAddress = cdpSolanaAddress;
  const evmWalletAddress = explicitEOAAddress || evmAddress || smartAccountAddress;

  const effectiveIsSignedIn = isAuthenticated;
  const displayEmail = linkedEmail || 'No email linked';

  const [verifiedPhone, setVerifiedPhoneLocal] = useState(getVerifiedPhone());
  const [phoneFresh, setPhoneFresh] = useState(isPhoneFresh60d());
  const [phoneExpiry, setPhoneExpiry] = useState(daysUntilExpiry());

  const [lifetimeTxThreshold, setLifetimeTxThresholdLocal] = useState(getLifetimeTransactionThreshold());

  const [alertState, setAlertState] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type: 'success' | 'error' | 'info';
  }>({
    visible: false,
    title: '',
    message: '',
    type: 'info',
  });

  const [showReverifyConfirm, setShowReverifyConfirm] = useState(false);
  const [reverifyPhone, setReverifyPhone] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<SettingsSectionKey>('account');

  const isExpoGo = process.env.EXPO_PUBLIC_USE_EXPO_CRYPTO === 'true';
  const signedButNoWallet = effectiveIsSignedIn && !evmWalletAddress && !solanaAddress;

  useFocusEffect(
    useCallback(() => {
      setVerifiedPhoneLocal(getVerifiedPhone());
      setPhoneFresh(isPhoneFresh60d());
      setPhoneExpiry(daysUntilExpiry());
    }, [])
  );

  useEffect(() => {
    if (!regentsUserId) return;

    const storedVerifiedPhone = getVerifiedPhone();
    const storedVerifiedPhoneUserId = getVerifiedPhoneUserId();

    if (storedVerifiedPhone && storedVerifiedPhoneUserId && storedVerifiedPhoneUserId !== regentsUserId) {
      setVerifiedPhone(null).then(() => {
        setVerifiedPhoneLocal(null);
        setPhoneFresh(false);
        setPhoneExpiry(-1);
      });
      return;
    }

    if (storedVerifiedPhone && linkedPhone && storedVerifiedPhone !== linkedPhone) {
      setVerifiedPhone(null).then(() => {
        setVerifiedPhoneLocal(null);
        setPhoneFresh(false);
        setPhoneExpiry(-1);
      });
    }
  }, [linkedPhone, regentsUserId]);

  useEffect(() => {
    setLifetimeTransactionThreshold(lifetimeTxThreshold);
  }, [lifetimeTxThreshold]);

  const openPhoneVerify = useCallback(() => {
    const cdpPhone = linkedPhone;

    if (cdpPhone) {
      setReverifyPhone(cdpPhone);
      setShowReverifyConfirm(true);
      return;
    }

    router.push({
      pathname: '/phone-verify',
      params: { initialPhone: verifiedPhone || '', mode: 'link' },
    });
  }, [linkedPhone, verifiedPhone]);

  const handleReverifyConfirm = useCallback(async () => {
    if (!reverifyPhone) return;

    setShowReverifyConfirm(false);

    try {
      await signOutIdentity();
      await signOutWallet();
      await new Promise(resolve => setTimeout(resolve, 500));

      router.replace({
        pathname: '/phone-verify',
        params: {
          initialPhone: reverifyPhone,
          mode: 'signin',
          autoSend: 'true',
        },
      });
    } catch (error: any) {
      setAlertState({
        visible: true,
        title: 'Error',
        message: error.message || 'Unable to start phone verification.',
        type: 'error',
      });
    }
  }, [reverifyPhone, signOutIdentity, signOutWallet]);

  const handleSignOut = useCallback(async () => {
    try {
      await signOutIdentity();
      await signOutWallet();
    } catch (error) {
      console.error('Sign out failed:', error);
    } finally {
      setCurrentWalletAddress(null);
      setCurrentSolanaAddress(null);
      setCountry('US');
      setSubdivision('CA');
      router.replace('/auth/login');
    }
  }, [signOutIdentity, signOutWallet]);

  if (!isInitialized) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={BLUE} />
        <Text style={styles.loadingText}>Preparing settings...</Text>
      </View>
    );
  }

  const cdpPhone = linkedPhone;
  const hasLinkedEmail = !!linkedEmail;
  const phoneIsVerified = verifiedPhone === cdpPhone && phoneFresh;
  const phoneIsExpired = verifiedPhone === cdpPhone && !phoneFresh;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
        <SettingsHero />
        <SettingsMenu activeSection={activeSection} displayEmail={displayEmail} onSectionChange={setActiveSection} />

        {activeSection === 'account' ? (
          <AccountManagementSection
            cdpPhone={cdpPhone}
            displayEmail={displayEmail}
            effectiveIsSignedIn={effectiveIsSignedIn}
            evmWalletAddress={evmWalletAddress}
            hasLinkedEmail={hasLinkedEmail}
            isExpoGo={isExpoGo}
            onOpenPhoneVerify={openPhoneVerify}
            phoneExpiry={phoneExpiry}
            phoneIsExpired={phoneIsExpired}
            phoneIsVerified={phoneIsVerified}
            setAlertState={setAlertState}
            signedButNoWallet={signedButNoWallet}
            solanaAddress={solanaAddress}
          />
        ) : null}

        {activeSection === 'wallet' ? (
          <WalletSettingsSection
            lifetimeTxThreshold={lifetimeTxThreshold}
            setLifetimeTxThresholdLocal={setLifetimeTxThresholdLocal}
          />
        ) : null}

        {activeSection === 'help' ? (
          <HelpSupportSection onOpenPhoneVerify={openPhoneVerify} />
        ) : null}

        <SignOutSection onSignOut={handleSignOut} />

        <CoinbaseAlert
          visible={alertState.visible}
          title={alertState.title}
          message={alertState.message}
          type={alertState.type}
          onConfirm={() => setAlertState(prev => ({ ...prev, visible: false }))}
        />

        <PhoneReverifyModal
          visible={showReverifyConfirm}
          onRequestClose={() => setShowReverifyConfirm(false)}
          onConfirm={handleReverifyConfirm}
        />

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DARK_BG,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 20,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: DARK_BG,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: TEXT_SECONDARY,
    fontSize: 14,
    fontFamily: FONTS.body,
  },
});
