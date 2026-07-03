/**
 * Account settings cluster: the account card (email + phone), the embedded
 * wallet-key export control, and the phone re-verify confirmation modal.
 *
 * Themed via useTheme + a memoized makeStyles(theme); callers stay transparent.
 *
 * The wallet-key export flow (request/confirm/copy) is money/auth-sensitive:
 * its logic is preserved exactly from the prior WalletKeyExportSection — only
 * the file location and color/font styling changed.
 */

import { StaggerGroup } from '@/components/motion/StaggerGroup';
import { StaggerItem } from '@/components/motion/StaggerItem';
import { RegentPressable } from '@/components/ui/RegentPressable';
import { runRegentHaptic } from '@/components/ui/haptics';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { formatPhoneDisplay } from '@/utils/state/verificationState';
import { useExportEvmAccount, useExportSolanaAccount } from '@coinbase/cdp-hooks';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SettingsModalSurface } from './SettingsModalSurface';

type SettingsAlertState = {
  visible: boolean;
  title: string;
  message: string;
  type: 'success' | 'error' | 'info';
};

type WalletKeyExportSectionProps = {
  effectiveIsSignedIn: boolean;
  evmWalletAddress: string | undefined;
  isExpoGo: boolean;
  setAlertState: Dispatch<SetStateAction<SettingsAlertState>>;
  solanaAddress: string | undefined;
};

export function WalletKeyExportSection({
  effectiveIsSignedIn,
  evmWalletAddress,
  isExpoGo,
  setAlertState,
  solanaAddress,
}: WalletKeyExportSectionProps) {
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { exportEvmAccount } = useExportEvmAccount();
  const { exportSolanaAccount } = useExportSolanaAccount();
  const [showWalletChoice, setShowWalletChoice] = useState(false);
  const [showExportConfirm, setShowExportConfirm] = useState(false);
  const [exportType, setExportType] = useState<'evm' | 'solana'>('evm');
  const [exporting, setExporting] = useState(false);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const copyNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyNoticeTimerRef.current) {
        clearTimeout(copyNoticeTimerRef.current);
      }
    };
  }, []);

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
      runRegentHaptic('copy');
      const copiedLabel = `${isEvmExport ? 'Base and Ethereum' : 'Solana'} wallet key copied.`;
      setCopyNotice(copiedLabel);
      if (copyNoticeTimerRef.current) {
        clearTimeout(copyNoticeTimerRef.current);
      }
      copyNoticeTimerRef.current = setTimeout(() => {
        setCopyNotice((current) => (current === copiedLabel ? null : current));
        copyNoticeTimerRef.current = null;
      }, 2200);
      setAlertState({
        visible: true,
        title: 'Wallet key copied',
        message: `Your ${isEvmExport ? 'Base and Ethereum' : 'Solana'} wallet key is now in the clipboard. Keep it somewhere safe and clear the clipboard when you are done.`,
        type: 'info',
      });
    } catch (error: any) {
      runRegentHaptic('warning');
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

  return (
    <>
      <RegentPressable
        haptic="warning"
        style={[styles.primaryButton, ((!evmWalletAddress && !solanaAddress) || exporting) && styles.disabledButton]}
        onPress={handleRequestExport}
        disabled={!evmWalletAddress && !solanaAddress}
      >
        <View style={styles.buttonContent}>
          {copyNotice ? <Ionicons name="checkmark-circle" size={16} color={colors.onAccent} /> : null}
          <Text style={styles.primaryButtonText}>
            {copyNotice ? 'Wallet key copied' : exporting ? 'Getting wallet key...' : isExpoGo ? 'Export unavailable here' : 'Export wallet key'}
          </Text>
        </View>
      </RegentPressable>
      {copyNotice ? (
        <View style={styles.copySuccessBanner}>
          <Ionicons name="checkmark-circle" size={16} color={colors.success} />
          <Text style={styles.copySuccessText}>{copyNotice}</Text>
        </View>
      ) : null}

      <SettingsModalSurface visible={showWalletChoice} onRequestClose={() => setShowWalletChoice(false)}>
        <StaggerGroup>
          <StaggerItem order={0}>
            <Text style={styles.modalTitle}>Choose a wallet</Text>
          </StaggerItem>
          <StaggerItem order={1}>
            <RegentPressable
              style={styles.primaryButton}
              onPress={() => {
                setExportType('evm');
                setShowWalletChoice(false);
                setShowExportConfirm(true);
              }}
            >
              <Text style={styles.primaryButtonText}>Export Base and Ethereum wallet</Text>
            </RegentPressable>
          </StaggerItem>
          <StaggerItem order={2}>
            <RegentPressable
              style={styles.primaryButton}
              onPress={() => {
                setExportType('solana');
                setShowWalletChoice(false);
                setShowExportConfirm(true);
              }}
            >
              <Text style={styles.primaryButtonText}>Export Solana wallet</Text>
            </RegentPressable>
          </StaggerItem>
          <StaggerItem order={3}>
            <RegentPressable style={styles.secondaryButton} onPress={() => setShowWalletChoice(false)}>
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </RegentPressable>
          </StaggerItem>
        </StaggerGroup>
      </SettingsModalSurface>

      <SettingsModalSurface visible={showExportConfirm} onRequestClose={() => setShowExportConfirm(false)}>
        <StaggerGroup>
          <StaggerItem order={0}>
            <Text style={styles.modalTitle}>Export wallet key</Text>
          </StaggerItem>
          <StaggerItem order={1}>
            <Text style={styles.helperText}>Anyone with this key can control this wallet. Only continue somewhere private, then clear the clipboard when you are done.</Text>
          </StaggerItem>
          <StaggerItem order={2}>
            <View style={styles.buttonRow}>
              <RegentPressable style={styles.secondaryButton} onPress={() => setShowExportConfirm(false)}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </RegentPressable>
              <RegentPressable haptic="warning" style={[styles.primaryButton, { flex: 1 }]} onPress={handleConfirmedExport}>
                <Text style={styles.primaryButtonText}>{exporting ? 'Getting key...' : 'Copy key'}</Text>
              </RegentPressable>
            </View>
          </StaggerItem>
        </StaggerGroup>
      </SettingsModalSurface>
    </>
  );
}

type AccountManagementSectionProps = {
  cdpPhone: string | undefined;
  displayEmail: string;
  effectiveIsSignedIn: boolean;
  evmWalletAddress: string | undefined;
  hasLinkedEmail: boolean;
  isExpoGo: boolean;
  onOpenPhoneVerify: () => void;
  phoneExpiry: number;
  phoneIsExpired: boolean;
  phoneIsVerified: boolean;
  setAlertState: Dispatch<SetStateAction<SettingsAlertState>>;
  signedButNoWallet: boolean;
  solanaAddress: string | undefined;
};

export function AccountManagementSection({
  cdpPhone,
  displayEmail,
  effectiveIsSignedIn,
  evmWalletAddress,
  hasLinkedEmail,
  isExpoGo,
  onOpenPhoneVerify,
  phoneExpiry,
  phoneIsExpired,
  phoneIsVerified,
  setAlertState,
  signedButNoWallet,
  solanaAddress,
}: AccountManagementSectionProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
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
              <RegentPressable style={styles.primaryButton} onPress={() => router.push('/email-verify?mode=link')}>
                <Text style={styles.primaryButtonText}>Add email</Text>
              </RegentPressable>
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
            <RegentPressable style={styles.primaryButton} onPress={onOpenPhoneVerify}>
              <Text style={styles.primaryButtonText}>
                {!cdpPhone ? 'Add phone' : phoneIsExpired ? 'Verify again' : phoneIsVerified ? 'Check again' : 'Verify phone'}
              </Text>
            </RegentPressable>
          </View>

          <WalletKeyExportSection
            effectiveIsSignedIn={effectiveIsSignedIn}
            evmWalletAddress={evmWalletAddress}
            isExpoGo={isExpoGo}
            setAlertState={setAlertState}
            solanaAddress={solanaAddress}
          />
        </>
      )}
    </View>
  );
}

type PhoneReverifyModalProps = {
  onConfirm: () => void;
  onRequestClose: () => void;
  visible: boolean;
};

export function PhoneReverifyModal({
  onConfirm,
  onRequestClose,
  visible,
}: PhoneReverifyModalProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <SettingsModalSurface visible={visible} onRequestClose={onRequestClose}>
      <StaggerGroup>
        <StaggerItem order={0}>
          <Text style={styles.modalTitle}>Verify phone again</Text>
        </StaggerItem>
        <StaggerItem order={1}>
          <Text style={styles.helperText}>We will sign you out and send a new code to your phone.</Text>
        </StaggerItem>
        <StaggerItem order={2}>
          <View style={styles.buttonRow}>
            <RegentPressable style={styles.secondaryButton} onPress={onRequestClose}>
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </RegentPressable>
            <RegentPressable haptic="warning" style={[styles.primaryButton, { flex: 1 }]} onPress={onConfirm}>
              <Text style={styles.primaryButtonText}>Continue</Text>
            </RegentPressable>
          </View>
        </StaggerItem>
      </StaggerGroup>
    </SettingsModalSurface>
  );
}

function makeStyles({ colors, fonts }: Theme) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: 28,
      borderWidth: 1,
      borderColor: colors.hairlineStrong,
      padding: 20,
      gap: 18,
      shadowColor: colors.accent,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.06,
      shadowRadius: 16,
      elevation: 2,
    },
    cardTitle: {
      color: colors.text,
      fontSize: 24,
      fontFamily: fonts.title,
    },
    infoBlock: {
      gap: 8,
    },
    labelText: {
      color: colors.textMuted,
      fontSize: 13,
      fontFamily: fonts.ui,
    },
    valueText: {
      color: colors.text,
      fontSize: 18,
      lineHeight: 24,
      fontFamily: fonts.ui,
    },
    helperText: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 18,
      fontFamily: fonts.ui,
    },
    buttonRow: {
      flexDirection: 'row',
      gap: 12,
      flexWrap: 'wrap',
    },
    buttonContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      minWidth: 0,
    },
    primaryButton: {
      backgroundColor: colors.accent,
      borderRadius: 18,
      paddingHorizontal: 16,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 56,
      minWidth: 120,
    },
    primaryButtonText: {
      color: colors.onAccent,
      fontSize: 15,
      lineHeight: 20,
      textAlign: 'center',
      fontFamily: fonts.ui,
    },
    secondaryButton: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.hairlineStrong,
      backgroundColor: colors.surface,
      borderRadius: 18,
      paddingHorizontal: 16,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 56,
      minWidth: 120,
    },
    secondaryButtonText: {
      color: colors.text,
      fontSize: 15,
      lineHeight: 20,
      textAlign: 'center',
      fontFamily: fonts.ui,
    },
    copySuccessBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.success,
      backgroundColor: colors.successWash,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    copySuccessText: {
      color: colors.success,
      fontSize: 13,
      lineHeight: 18,
      fontFamily: fonts.ui,
    },
    disabledButton: {
      opacity: 0.55,
    },
    modalTitle: {
      color: colors.accent,
      fontSize: 18,
      fontFamily: fonts.title,
    },
  });
}
