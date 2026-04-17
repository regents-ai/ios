import { CoinbaseAlert } from '@/components/ui/CoinbaseAlerts';
import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import { TEST_ACCOUNTS } from '@/constants/TestAccounts';
import { useRegentsAuth } from '@/hooks/useRegentsAuth';
import {
  daysUntilExpiry,
  formatPhoneDisplay,
  getLifetimeTransactionThreshold,
  getManualWalletAddress,
  getSandboxMode,
  getTestWalletSol,
  getVerifiedPhone,
  getVerifiedPhoneUserId,
  isPhoneFresh60d,
  isTestSessionActive,
  setCountry,
  setCurrentSolanaAddress,
  setCurrentWalletAddress,
  setLifetimeTransactionThreshold,
  setManualWalletAddress,
  setSandboxMode,
  setSubdivision,
  setVerifiedPhone,
  clearManualAddress,
  clearTestSession,
} from '@/utils/sharedState';
import {
  useCurrentUser,
  useEvmAddress,
  useExportEvmAccount,
  useExportSolanaAccount,
  useIsInitialized,
  useSignOut,
  useSolanaAddress,
} from '@coinbase/cdp-hooks';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

const { CARD_BG, TEXT_PRIMARY, TEXT_SECONDARY, BLUE, BORDER, WHITE } = COLORS;

export default function SettingsScreen() {
  const testSession = isTestSessionActive();
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
  const { exportEvmAccount } = useExportEvmAccount();
  const { exportSolanaAccount } = useExportSolanaAccount();
  const { evmAddress } = useEvmAddress();
  const { solanaAddress: cdpSolanaAddress } = useSolanaAddress();

  const explicitEOAAddress = testSession ? TEST_ACCOUNTS.wallets.eoaDummy : (currentUser?.evmAccounts?.[0] as string | undefined);
  const smartAccountAddress = testSession ? TEST_ACCOUNTS.wallets.evm : (currentUser?.evmSmartAccounts?.[0] as string | undefined);
  const solanaAddress = testSession ? getTestWalletSol() : cdpSolanaAddress;
  const evmWalletAddress = explicitEOAAddress || evmAddress || smartAccountAddress;

  const effectiveIsSignedIn = testSession || isAuthenticated;
  const displayEmail = testSession ? TEST_ACCOUNTS.email : (linkedEmail || 'No email linked');

  const [verifiedPhone, setVerifiedPhoneLocal] = useState(getVerifiedPhone());
  const [phoneFresh, setPhoneFresh] = useState(isPhoneFresh60d());
  const [phoneExpiry, setPhoneExpiry] = useState(daysUntilExpiry());

  const [localSandboxEnabled, setLocalSandboxEnabled] = useState(getSandboxMode());
  const [manualAddress, setManualAddress] = useState(getManualWalletAddress() || '');
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
  const [showWalletChoice, setShowWalletChoice] = useState(false);
  const [showExportConfirm, setShowExportConfirm] = useState(false);
  const [exportType, setExportType] = useState<'evm' | 'solana'>('evm');
  const [exporting, setExporting] = useState(false);
  const [productionSwitchAlertVisible, setProductionSwitchAlertVisible] = useState(false);

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
    if (localSandboxEnabled) {
      setManualWalletAddress(manualAddress || null);
    } else {
      setManualWalletAddress(null);
    }
  }, [manualAddress, localSandboxEnabled]);

  useEffect(() => {
    setLifetimeTransactionThreshold(lifetimeTxThreshold);
  }, [lifetimeTxThreshold]);

  const openPhoneVerify = useCallback(() => {
    const cdpPhone = testSession
      ? TEST_ACCOUNTS.phone
      : linkedPhone;

    if (cdpPhone) {
      setReverifyPhone(cdpPhone);
      setShowReverifyConfirm(true);
      return;
    }

    router.push({
      pathname: '/phone-verify',
      params: { initialPhone: verifiedPhone || '', mode: 'link' },
    });
  }, [linkedPhone, testSession, verifiedPhone]);

  const handleReverifyConfirm = useCallback(async () => {
    if (!reverifyPhone) return;

    setShowReverifyConfirm(false);

    try {
      if (!testSession) {
        await signOutIdentity();
        await signOutWallet();
        await new Promise(resolve => setTimeout(resolve, 500));
      }

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
  }, [reverifyPhone, signOutIdentity, signOutWallet, testSession]);

  const handleSignOut = useCallback(async () => {
    try {
      if (testSession) {
        await clearTestSession();
      } else {
        await signOutIdentity();
        await signOutWallet();
      }
    } catch (error) {
      console.error('Sign out failed:', error);
    } finally {
      setCurrentWalletAddress(null);
      setCurrentSolanaAddress(null);
      setManualWalletAddress(null);
      setCountry('US');
      setSubdivision('CA');
      setSandboxMode(true);
      router.replace('/auth/login');
    }
  }, [signOutIdentity, signOutWallet, testSession]);

  const handleRequestExport = () => {
    if (!effectiveIsSignedIn || (!evmWalletAddress && !solanaAddress)) return;

    if (isExpoGo) {
      setAlertState({
        visible: true,
        title: 'Export unavailable',
        message: 'Open the installed app to export a private key.',
        type: 'info',
      });
      return;
    }

    if (evmWalletAddress && solanaAddress) {
      setShowWalletChoice(true);
    } else if (evmWalletAddress) {
      setExportType('evm');
      setShowExportConfirm(true);
    } else if (solanaAddress) {
      setExportType('solana');
      setShowExportConfirm(true);
    }
  };

  const handleConfirmedExport = async () => {
    const isEvmExport = exportType === 'evm';
    const targetAddress = isEvmExport ? evmWalletAddress : solanaAddress;

    if (!targetAddress) {
      setAlertState({
        visible: true,
        title: 'Export failed',
        message: `No ${isEvmExport ? 'Base and Ethereum' : 'Solana'} wallet is available to export.`,
        type: 'error',
      });
      return;
    }

    setExporting(true);
    try {
      if (testSession) {
        await Clipboard.setStringAsync(TEST_ACCOUNTS.seedPhrase);
        setAlertState({
          visible: true,
          title: 'Mock seed phrase copied',
          message: 'This copied a review-only seed phrase for testing.',
          type: 'info',
        });
      } else {
        const result = isEvmExport
          ? await exportEvmAccount({ evmAccount: evmWalletAddress! as `0x${string}` })
          : await exportSolanaAccount({ solanaAccount: solanaAddress! });

        await Clipboard.setStringAsync(result.privateKey);
        setAlertState({
          visible: true,
          title: 'Private key copied',
          message: `Your ${isEvmExport ? 'Base and Ethereum' : 'Solana'} wallet key is now in the clipboard. Store it safely and clear the clipboard when finished.`,
          type: 'info',
        });
      }
    } catch (error: any) {
      setAlertState({
        visible: true,
        title: 'Export failed',
        message: error.message || 'Unable to export the selected wallet.',
        type: 'error',
      });
    } finally {
      setExporting(false);
      setShowExportConfirm(false);
      setShowWalletChoice(false);
    }
  };

  if (!isInitialized) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={BLUE} />
        <Text style={styles.loadingText}>Preparing settings...</Text>
      </View>
    );
  }

  const cdpPhone = testSession ? TEST_ACCOUNTS.phone : linkedPhone;
  const hasLinkedEmail = !!linkedEmail || testSession;
  const phoneIsVerified = verifiedPhone === cdpPhone && phoneFresh;
  const phoneIsExpired = verifiedPhone === cdpPhone && !phoneFresh;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={20} color={TEXT_PRIMARY} />
          </Pressable>
          <Text style={styles.title}>Settings</Text>
          <View style={{ width: 36 }} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Account</Text>

          {signedButNoWallet ? (
            <View style={styles.infoBlock}>
              <Text style={styles.valueText}>Wallet creation in progress</Text>
              <Text style={styles.helperText}>Wait a moment for your wallet to finish setting up, or sign out and try again.</Text>
              <Pressable style={styles.secondaryButton} onPress={handleSignOut}>
                <Text style={styles.secondaryButtonText}>Sign out</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={styles.infoBlock}>
                <Text style={styles.labelText}>Email</Text>
                <Text style={styles.valueText}>{displayEmail}</Text>
                {!hasLinkedEmail && !testSession ? (
                  <Pressable style={styles.primaryButton} onPress={() => router.push('/email-verify?mode=link')}>
                    <Text style={styles.primaryButtonText}>Link email</Text>
                  </Pressable>
                ) : null}
              </View>

              <View style={styles.infoBlock}>
                <Text style={styles.labelText}>Phone</Text>
                <Text style={styles.valueText}>{cdpPhone ? formatPhoneDisplay(cdpPhone) : 'No phone linked'}</Text>
                <Text style={styles.helperText}>
                  {phoneIsVerified
                    ? `Verified for checkout. Expires in ${phoneExpiry} day${phoneExpiry === 1 ? '' : 's'}.`
                    : phoneIsExpired
                      ? 'Verification expired. Re-verify to use checkout.'
                      : cdpPhone
                        ? 'Phone linked. Verify it before using checkout.'
                        : 'Link a phone number to use checkout.'}
                </Text>
                <Pressable style={styles.primaryButton} onPress={openPhoneVerify}>
                  <Text style={styles.primaryButtonText}>
                    {!cdpPhone ? 'Link phone' : phoneIsExpired ? 'Re-verify phone' : phoneIsVerified ? 'Verify again' : 'Verify phone'}
                  </Text>
                </Pressable>
              </View>

              <View style={styles.buttonRow}>
                <Pressable
                  style={[styles.primaryButton, ((!evmWalletAddress && !solanaAddress) || exporting) && styles.disabledButton]}
                  onPress={handleRequestExport}
                  disabled={!evmWalletAddress && !solanaAddress}
                >
                  <Text style={styles.primaryButtonText}>
                    {exporting ? 'Exporting...' : isExpoGo ? 'Export unavailable in Expo Go' : 'Export private key'}
                  </Text>
                </Pressable>
              </View>

              <View style={styles.buttonRow}>
                <Pressable style={styles.secondaryButton} onPress={() => router.push('/support')}>
                  <Text style={styles.secondaryButtonText}>Support</Text>
                </Pressable>
                <Pressable style={[styles.secondaryButton, styles.signOutButton]} onPress={handleSignOut}>
                  <Text style={[styles.secondaryButtonText, { color: WHITE }]}>Sign out</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Wallet settings</Text>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.labelText}>Sandbox mode</Text>
              <Text style={styles.helperText}>
                {localSandboxEnabled ? 'Test without sending real money.' : 'Use live money movement and real checkout.'}
              </Text>
            </View>
            <Switch
              value={localSandboxEnabled}
              onValueChange={value => {
                if (!value && manualAddress) {
                  setProductionSwitchAlertVisible(true);
                  return;
                }
                setLocalSandboxEnabled(value);
                setSandboxMode(value);
              }}
              trackColor={{ true: BLUE, false: BORDER }}
            />
          </View>

          <View style={styles.infoBlock}>
            <Text style={styles.labelText}>Apple Pay reminder threshold</Text>
            <Text style={styles.helperText}>Choose when to show the reminder that your remaining Apple Pay transactions are getting low.</Text>
            <TextInput
              style={styles.numberInput}
              value={String(lifetimeTxThreshold)}
              onChangeText={text => {
                const parsed = parseInt(text, 10);
                if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 99) {
                  setLifetimeTxThresholdLocal(parsed);
                } else if (text === '') {
                  setLifetimeTxThresholdLocal(0);
                }
              }}
              keyboardType="number-pad"
              maxLength={2}
              placeholder="5"
              placeholderTextColor={TEXT_SECONDARY}
            />
          </View>
        </View>

        {localSandboxEnabled ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Sandbox testing</Text>
            <Text style={styles.helperText}>Override the connected wallet address for test runs only.</Text>
            <View style={styles.manualAddressRow}>
              <TextInput
                style={styles.textInput}
                value={manualAddress}
                onChangeText={setManualAddress}
                placeholder="Enter a wallet address"
                placeholderTextColor={TEXT_SECONDARY}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Pressable
                style={styles.pasteButton}
                onPress={async () => {
                  if (manualAddress) {
                    setManualAddress('');
                    return;
                  }
                  const text = await Clipboard.getStringAsync();
                  if (text) setManualAddress(text);
                }}
              >
                <Ionicons name={manualAddress ? 'close-circle' : 'clipboard-outline'} size={20} color={manualAddress ? TEXT_SECONDARY : BLUE} />
              </Pressable>
            </View>
            <Text style={styles.helperText}>This address is cleared automatically when you switch back to production mode.</Text>
          </View>
        ) : null}

        <CoinbaseAlert
          visible={alertState.visible}
          title={alertState.title}
          message={alertState.message}
          type={alertState.type}
          onConfirm={() => setAlertState(prev => ({ ...prev, visible: false }))}
        />

        <Modal visible={showWalletChoice} transparent animationType="fade" onRequestClose={() => setShowWalletChoice(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Choose a wallet</Text>
              <Pressable
                style={styles.primaryButton}
                onPress={() => {
                  setExportType('evm');
                  setShowWalletChoice(false);
                  setShowExportConfirm(true);
                }}
              >
                <Text style={styles.primaryButtonText}>Export Base and Ethereum wallet</Text>
              </Pressable>
              <Pressable
                style={styles.primaryButton}
                onPress={() => {
                  setExportType('solana');
                  setShowWalletChoice(false);
                  setShowExportConfirm(true);
                }}
              >
                <Text style={styles.primaryButtonText}>Export Solana wallet</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={() => setShowWalletChoice(false)}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

        <Modal visible={showExportConfirm} transparent animationType="fade" onRequestClose={() => setShowExportConfirm(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Export private key</Text>
              <Text style={styles.helperText}>This copies the selected wallet key to the clipboard.</Text>
              <View style={styles.buttonRow}>
                <Pressable style={styles.secondaryButton} onPress={() => setShowExportConfirm(false)}>
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </Pressable>
                <Pressable style={[styles.primaryButton, { flex: 1 }]} onPress={handleConfirmedExport}>
                  <Text style={styles.primaryButtonText}>{exporting ? 'Exporting...' : 'Export'}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        <Modal visible={showReverifyConfirm} transparent animationType="fade" onRequestClose={() => setShowReverifyConfirm(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Re-verify phone</Text>
              <Text style={styles.helperText}>We need to sign you out and send a fresh code to your phone number.</Text>
              <View style={styles.buttonRow}>
                <Pressable style={styles.secondaryButton} onPress={() => setShowReverifyConfirm(false)}>
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </Pressable>
                <Pressable style={[styles.primaryButton, { flex: 1 }]} onPress={handleReverifyConfirm}>
                  <Text style={styles.primaryButtonText}>Continue</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        <Modal visible={productionSwitchAlertVisible} transparent animationType="fade" onRequestClose={() => setProductionSwitchAlertVisible(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Switch to production?</Text>
              <Text style={styles.helperText}>Your manual sandbox address will be cleared when you leave sandbox mode.</Text>
              <View style={styles.buttonRow}>
                <Pressable style={styles.secondaryButton} onPress={() => setProductionSwitchAlertVisible(false)}>
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.primaryButton, { flex: 1 }]}
                  onPress={() => {
                    setProductionSwitchAlertVisible(false);
                    setLocalSandboxEnabled(false);
                    setSandboxMode(false);
                    clearManualAddress();
                    setManualAddress('');
                  }}
                >
                  <Text style={styles.primaryButtonText}>Confirm</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CARD_BG,
  },
  content: {
    padding: 20,
    gap: 20,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: CARD_BG,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: TEXT_SECONDARY,
    fontSize: 14,
    fontFamily: FONTS.body,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: TEXT_PRIMARY,
    fontSize: 22,
    fontFamily: FONTS.heading,
  },
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    gap: 16,
  },
  cardTitle: {
    color: TEXT_PRIMARY,
    fontSize: 18,
    fontFamily: FONTS.heading,
  },
  infoBlock: {
    gap: 8,
  },
  labelText: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    fontFamily: FONTS.body,
  },
  valueText: {
    color: TEXT_PRIMARY,
    fontSize: 16,
    fontFamily: FONTS.body,
  },
  helperText: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FONTS.body,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  primaryButton: {
    backgroundColor: BLUE,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: WHITE,
    fontSize: 14,
    fontFamily: FONTS.body,
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: TEXT_PRIMARY,
    fontSize: 14,
    fontFamily: FONTS.body,
  },
  signOutButton: {
    backgroundColor: '#B54A3E',
    borderColor: '#B54A3E',
  },
  disabledButton: {
    opacity: 0.55,
  },
  numberInput: {
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: TEXT_PRIMARY,
    fontSize: 16,
    width: 90,
    textAlign: 'center',
    fontFamily: FONTS.body,
  },
  manualAddressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: TEXT_PRIMARY,
    fontSize: 14,
    fontFamily: FONTS.body,
  },
  pasteButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: CARD_BG,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 20,
    gap: 16,
  },
  modalTitle: {
    color: TEXT_PRIMARY,
    fontSize: 18,
    fontFamily: FONTS.heading,
  },
});
