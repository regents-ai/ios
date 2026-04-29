import { CoinbaseAlert } from '@/components/ui/CoinbaseAlerts';
import { StaggerGroup } from '@/components/motion/StaggerGroup';
import { StaggerItem } from '@/components/motion/StaggerItem';
import { getEaseTransition } from '@/components/motion/easePresets';
import { useReducedMotion } from '@/components/motion/useReducedMotion';
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
  formatPhoneDisplay,
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
import { EaseView } from 'react-native-ease';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

const { DARK_BG, CARD_BG, CARD_ALT, TEXT_PRIMARY, TEXT_SECONDARY, BLUE, BORDER, WHITE, DANGER } = COLORS;

function SettingsModalSurface({
  children,
  onRequestClose,
  visible,
}: {
  children: React.ReactNode;
  onRequestClose: () => void;
  visible: boolean;
}) {
  const reducedMotionEnabled = useReducedMotion();
  const [isPresented, setIsPresented] = useState(visible);

  useEffect(() => {
    if (visible) {
      setIsPresented(true);
    }
  }, [visible]);

  return (
    <Modal visible={isPresented} transparent animationType="none" onRequestClose={onRequestClose}>
      <View style={styles.modalOverlay}>
        <EaseView
          initialAnimate={{ opacity: 0 }}
          animate={{ opacity: visible ? 1 : 0 }}
          style={StyleSheet.absoluteFillObject}
          transition={getEaseTransition('card', reducedMotionEnabled)}
        >
          <Pressable style={StyleSheet.absoluteFillObject} onPress={onRequestClose} />
        </EaseView>

        <EaseView
          initialAnimate={{ opacity: 0, translateY: 8, scale: 0.985 }}
          animate={{ opacity: visible ? 1 : 0, translateY: visible ? 0 : 8, scale: visible ? 1 : 0.985 }}
          onTransitionEnd={({ finished }) => {
            if (finished && !visible) {
              setIsPresented(false);
            }
          }}
          style={styles.modalCard}
          transition={getEaseTransition('emphasis', reducedMotionEnabled)}
        >
          {children}
        </EaseView>
      </View>
    </Modal>
  );
}

type SettingsSectionKey = 'account' | 'wallet' | 'help';

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
  const { exportEvmAccount } = useExportEvmAccount();
  const { exportSolanaAccount } = useExportSolanaAccount();
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
  const [showWalletChoice, setShowWalletChoice] = useState(false);
  const [showExportConfirm, setShowExportConfirm] = useState(false);
  const [exportType, setExportType] = useState<'evm' | 'solana'>('evm');
  const [exporting, setExporting] = useState(false);
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

  const handleRequestExport = () => {
    if (!effectiveIsSignedIn || (!evmWalletAddress && !solanaAddress)) return;

    if (isExpoGo) {
      setAlertState({
        visible: true,
        title: 'Export unavailable',
        message: 'Open the installed app to export your wallet key.',
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
      const result = isEvmExport
        ? await exportEvmAccount({ evmAccount: evmWalletAddress! as `0x${string}` })
        : await exportSolanaAccount({ solanaAccount: solanaAddress! });

      await Clipboard.setStringAsync(result.privateKey);
      setAlertState({
        visible: true,
        title: 'Wallet key copied',
        message: `Your ${isEvmExport ? 'Base and Ethereum' : 'Solana'} wallet key is now in the clipboard. Keep it somewhere safe and clear the clipboard when you are done.`,
        type: 'info',
      });
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

  const cdpPhone = linkedPhone;
  const hasLinkedEmail = !!linkedEmail;
  const phoneIsVerified = verifiedPhone === cdpPhone && phoneFresh;
  const phoneIsExpired = verifiedPhone === cdpPhone && !phoneFresh;
  const sectionOptions: {
    key: SettingsSectionKey;
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    detail: string;
  }[] = [
    {
      key: 'account',
      icon: 'person-outline',
      title: 'Account',
      detail: displayEmail,
    },
    {
      key: 'wallet',
      icon: 'wallet-outline',
      title: 'Wallet',
      detail: 'Ready for everyday use',
    },
    {
      key: 'help',
      icon: 'help-circle-outline',
      title: 'Help',
      detail: 'Support and quick answers',
    },
  ];

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
        <View style={styles.hero}>
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} style={styles.backButton}>
              <Ionicons name="chevron-back" size={20} color={TEXT_PRIMARY} />
            </Pressable>
          </View>
          <Text style={styles.heroEyebrow}>Regents</Text>
          <Text style={styles.title}>Settings</Text>
          <Text style={styles.heroSubtitle}>Account, wallet, and help in one place.</Text>
        </View>

        <View style={styles.menuCard}>
          {sectionOptions.map((section, index) => {
            const selected = section.key === activeSection;

            return (
              <View key={section.key}>
                <Pressable
                  style={({ pressed }) => [
                    styles.menuRow,
                    selected && styles.menuRowActive,
                    pressed && styles.menuRowPressed,
                  ]}
                  onPress={() => setActiveSection(section.key)}
                >
                  <View style={[styles.menuIcon, selected && styles.menuIconActive]}>
                    <Ionicons
                      name={section.icon}
                      size={24}
                      color={selected ? WHITE : TEXT_PRIMARY}
                    />
                  </View>
                  <View style={styles.menuCopy}>
                    <Text style={styles.menuTitle}>{section.title}</Text>
                    <Text style={styles.menuDetail}>{section.detail}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={TEXT_SECONDARY} />
                </Pressable>
                {index < sectionOptions.length - 1 ? <View style={styles.menuDivider} /> : null}
              </View>
            );
          })}
        </View>

        {activeSection === 'account' ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Account</Text>

            {signedButNoWallet ? (
              <View style={styles.infoBlock}>
                <Text style={styles.valueText}>Your wallet is still getting ready.</Text>
                <Text style={styles.helperText}>Give it a moment, or sign out and try again.</Text>
              </View>
            ) : (
              <>
                <View style={styles.infoBlock}>
                  <Text style={styles.labelText}>Email</Text>
                  <Text style={styles.valueText}>{displayEmail}</Text>
                  {!hasLinkedEmail ? (
                    <Pressable style={styles.primaryButton} onPress={() => router.push('/email-verify?mode=link')}>
                      <Text style={styles.primaryButtonText}>Add email</Text>
                    </Pressable>
                  ) : null}
                </View>

                <View style={styles.infoBlock}>
                  <Text style={styles.labelText}>Phone</Text>
                  <Text style={styles.valueText}>{cdpPhone ? formatPhoneDisplay(cdpPhone) : 'Not added yet'}</Text>
                  <Text style={styles.helperText}>
                    {phoneIsVerified
                      ? `Ready for checkout. Expires in ${phoneExpiry} day${phoneExpiry === 1 ? '' : 's'}.`
                      : phoneIsExpired
                        ? 'Verification expired. Verify your phone again to keep using checkout.'
                        : cdpPhone
                          ? 'Your phone is linked. Verify it before you use checkout.'
                          : 'Add a phone number before you use checkout.'}
                  </Text>
                  <Pressable style={styles.primaryButton} onPress={openPhoneVerify}>
                    <Text style={styles.primaryButtonText}>
                      {!cdpPhone ? 'Add phone' : phoneIsExpired ? 'Verify again' : phoneIsVerified ? 'Check again' : 'Verify phone'}
                    </Text>
                  </Pressable>
                </View>

                <Pressable
                  style={[styles.primaryButton, ((!evmWalletAddress && !solanaAddress) || exporting) && styles.disabledButton]}
                  onPress={handleRequestExport}
                  disabled={!evmWalletAddress && !solanaAddress}
                >
                  <Text style={styles.primaryButtonText}>
                    {exporting ? 'Getting wallet key...' : isExpoGo ? 'Export unavailable here' : 'Export wallet key'}
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        ) : null}

        {activeSection === 'wallet' ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Wallet</Text>

            <View style={styles.infoBlock}>
              <Text style={styles.labelText}>Apple Pay reminder</Text>
              <Text style={styles.helperText}>Choose when to remind someone that their Apple Pay limit is running low.</Text>
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
        ) : null}

        {activeSection === 'help' ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Help</Text>
            <View style={styles.infoBlock}>
              <Text style={styles.valueText}>Need help with money movement or account steps?</Text>
              <Text style={styles.helperText}>Support can help with wallet questions, checkout steps, and payment issues.</Text>
            </View>
            <View style={styles.buttonRow}>
              <Pressable style={styles.primaryButton} onPress={() => router.push('/support')}>
                <Text style={styles.primaryButtonText}>Open support</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={openPhoneVerify}>
                <Text style={styles.secondaryButtonText}>Phone help</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <Pressable style={styles.signOutCta} onPress={handleSignOut}>
          <Text style={styles.signOutCtaText}>Sign out</Text>
        </Pressable>

        <CoinbaseAlert
          visible={alertState.visible}
          title={alertState.title}
          message={alertState.message}
          type={alertState.type}
          onConfirm={() => setAlertState(prev => ({ ...prev, visible: false }))}
        />

        <SettingsModalSurface visible={showWalletChoice} onRequestClose={() => setShowWalletChoice(false)}>
          <StaggerGroup>
            <StaggerItem order={0}>
              <Text style={styles.modalTitle}>Choose a wallet</Text>
            </StaggerItem>
            <StaggerItem order={1}>
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
            </StaggerItem>
            <StaggerItem order={2}>
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
            </StaggerItem>
            <StaggerItem order={3}>
              <Pressable style={styles.secondaryButton} onPress={() => setShowWalletChoice(false)}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
            </StaggerItem>
          </StaggerGroup>
        </SettingsModalSurface>

        <SettingsModalSurface visible={showExportConfirm} onRequestClose={() => setShowExportConfirm(false)}>
          <StaggerGroup>
            <StaggerItem order={0}>
              <Text style={styles.modalTitle}>Export wallet key</Text>
            </StaggerItem>
            <StaggerItem order={1}>
              <Text style={styles.helperText}>This copies the selected wallet key to the clipboard.</Text>
            </StaggerItem>
            <StaggerItem order={2}>
              <View style={styles.buttonRow}>
                <Pressable style={styles.secondaryButton} onPress={() => setShowExportConfirm(false)}>
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </Pressable>
                <Pressable style={[styles.primaryButton, { flex: 1 }]} onPress={handleConfirmedExport}>
                  <Text style={styles.primaryButtonText}>{exporting ? 'Exporting...' : 'Export'}</Text>
                </Pressable>
              </View>
            </StaggerItem>
          </StaggerGroup>
        </SettingsModalSurface>

        <SettingsModalSurface visible={showReverifyConfirm} onRequestClose={() => setShowReverifyConfirm(false)}>
          <StaggerGroup>
            <StaggerItem order={0}>
              <Text style={styles.modalTitle}>Verify phone again</Text>
            </StaggerItem>
            <StaggerItem order={1}>
              <Text style={styles.helperText}>We will sign you out and send a new code to your phone.</Text>
            </StaggerItem>
            <StaggerItem order={2}>
              <View style={styles.buttonRow}>
                <Pressable style={styles.secondaryButton} onPress={() => setShowReverifyConfirm(false)}>
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </Pressable>
                <Pressable style={[styles.primaryButton, { flex: 1 }]} onPress={handleReverifyConfirm}>
                  <Text style={styles.primaryButtonText}>Continue</Text>
                </Pressable>
              </View>
            </StaggerItem>
          </StaggerGroup>
        </SettingsModalSurface>

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
  hero: {
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: CARD_ALT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroEyebrow: {
    color: BLUE,
    fontSize: 12,
    fontFamily: FONTS.heading,
  },
  title: {
    color: TEXT_PRIMARY,
    fontSize: 42,
    lineHeight: 44,
    fontFamily: FONTS.heading,
  },
  heroSubtitle: {
    color: TEXT_SECONDARY,
    fontSize: 16,
    lineHeight: 22,
    fontFamily: FONTS.body,
  },
  menuCard: {
    backgroundColor: CARD_BG,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  menuRowActive: {
    backgroundColor: CARD_ALT,
  },
  menuRowPressed: {
    opacity: 0.84,
  },
  menuIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: DARK_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuIconActive: {
    backgroundColor: BLUE,
  },
  menuCopy: {
    flex: 1,
    gap: 4,
  },
  menuTitle: {
    color: TEXT_PRIMARY,
    fontSize: 20,
    fontFamily: FONTS.heading,
  },
  menuDetail: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: FONTS.body,
  },
  menuDivider: {
    height: 1,
    backgroundColor: BORDER,
    marginLeft: 78,
  },
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 20,
    gap: 18,
    shadowColor: BLUE,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 2,
  },
  cardTitle: {
    color: TEXT_PRIMARY,
    fontSize: 24,
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
    fontSize: 18,
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
  rowCopyBlock: {
    flex: 1,
    paddingRight: 12,
    gap: 6,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  primaryButton: {
    backgroundColor: BLUE,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  primaryButtonText: {
    color: WHITE,
    fontSize: 15,
    fontFamily: FONTS.body,
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD_ALT,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  secondaryButtonText: {
    color: TEXT_PRIMARY,
    fontSize: 15,
    fontFamily: FONTS.body,
  },
  disabledButton: {
    opacity: 0.55,
  },
  numberInput: {
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD_ALT,
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
    backgroundColor: CARD_ALT,
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
    backgroundColor: CARD_ALT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutCta: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 22,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  signOutCtaText: {
    color: DANGER,
    fontSize: 18,
    fontFamily: FONTS.body,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: CARD_BG,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 20,
    gap: 16,
  },
  modalTitle: {
    color: BLUE,
    fontSize: 18,
    fontFamily: FONTS.heading,
  },
});
