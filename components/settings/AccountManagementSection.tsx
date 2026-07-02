import { RegentPressable } from '@/components/ui/RegentPressable';
import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import { formatPhoneDisplay } from '@/utils/state/verificationState';
import { router } from 'expo-router';
import { type Dispatch, type SetStateAction } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WalletKeyExportSection } from './WalletKeyExportSection';

const { CARD_BG, TEXT_PRIMARY, TEXT_SECONDARY, BLUE, BORDER, WHITE } = COLORS;

type SettingsAlertState = {
  visible: boolean;
  title: string;
  message: string;
  type: 'success' | 'error' | 'info';
};

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

const styles = StyleSheet.create({
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
    lineHeight: 24,
    fontFamily: FONTS.body,
  },
  helperText: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FONTS.body,
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
});
