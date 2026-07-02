import { StaggerGroup } from '@/components/motion/StaggerGroup';
import { StaggerItem } from '@/components/motion/StaggerItem';
import { RegentPressable } from '@/components/ui/RegentPressable';
import { runRegentHaptic } from '@/components/ui/haptics';
import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import { useExportEvmAccount, useExportSolanaAccount } from '@coinbase/cdp-hooks';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SettingsModalSurface } from './SettingsModalSurface';

const { CARD_ALT, TEXT_PRIMARY, TEXT_SECONDARY, BLUE, BORDER, WHITE, SUCCESS } = COLORS;
const GREEN_WASH = '#E6F0EA';

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
          {copyNotice ? <Ionicons name="checkmark-circle" size={16} color={WHITE} /> : null}
          <Text style={styles.primaryButtonText}>
            {copyNotice ? 'Wallet key copied' : exporting ? 'Getting wallet key...' : isExpoGo ? 'Export unavailable here' : 'Export wallet key'}
          </Text>
        </View>
      </RegentPressable>
      {copyNotice ? (
        <View style={styles.copySuccessBanner}>
          <Ionicons name="checkmark-circle" size={16} color={SUCCESS} />
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

const styles = StyleSheet.create({
  helperText: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FONTS.body,
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
    backgroundColor: BLUE,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    minWidth: 120,
  },
  primaryButtonText: {
    color: WHITE,
    fontSize: 15,
    lineHeight: 20,
    textAlign: 'center',
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
    minWidth: 120,
  },
  secondaryButtonText: {
    color: TEXT_PRIMARY,
    fontSize: 15,
    lineHeight: 20,
    textAlign: 'center',
    fontFamily: FONTS.body,
  },
  copySuccessBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: SUCCESS,
    backgroundColor: GREEN_WASH,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  copySuccessText: {
    color: SUCCESS,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FONTS.body,
  },
  disabledButton: {
    opacity: 0.55,
  },
  modalTitle: {
    color: BLUE,
    fontSize: 18,
    fontFamily: FONTS.heading,
  },
});
