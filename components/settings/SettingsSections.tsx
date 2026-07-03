/**
 * The small standalone settings sections: wallet preferences, help & support,
 * and the sign-out action. Grouped together as they are each single-purpose
 * cards used only by the settings screen.
 *
 * Themed via useTheme + a memoized makeStyles(theme); callers stay transparent.
 */

import { RegentPressable } from '@/components/ui/RegentPressable';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { router } from 'expo-router';
import { useMemo, type Dispatch, type SetStateAction } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

type WalletSettingsSectionProps = {
  lifetimeTxThreshold: number;
  setLifetimeTxThresholdLocal: Dispatch<SetStateAction<number>>;
};

export function WalletSettingsSection({
  lifetimeTxThreshold,
  setLifetimeTxThresholdLocal,
}: WalletSettingsSectionProps) {
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
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
          placeholderTextColor={colors.textMuted}
        />
      </View>
    </View>
  );
}

type HelpSupportSectionProps = {
  onOpenPhoneVerify: () => void;
};

export function HelpSupportSection({
  onOpenPhoneVerify,
}: HelpSupportSectionProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Help</Text>
      <View style={styles.infoBlock}>
        <Text style={styles.valueText}>Need help with money movement or account steps?</Text>
        <Text style={styles.helperText}>Support can help with wallet questions, checkout steps, and payment issues.</Text>
      </View>
      <View style={styles.buttonRow}>
        <RegentPressable style={styles.primaryButton} onPress={() => router.push('/support')}>
          <Text style={styles.primaryButtonText}>Open support</Text>
        </RegentPressable>
        <RegentPressable style={styles.secondaryButton} onPress={onOpenPhoneVerify}>
          <Text style={styles.secondaryButtonText}>Phone help</Text>
        </RegentPressable>
      </View>
    </View>
  );
}

type SignOutSectionProps = {
  onSignOut: () => void;
};

export function SignOutSection({
  onSignOut,
}: SignOutSectionProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <RegentPressable haptic="warning" style={styles.signOutCta} onPress={onSignOut}>
      <Text style={styles.signOutCtaText}>Sign out</Text>
    </RegentPressable>
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
    numberInput: {
      borderWidth: 1,
      borderColor: colors.hairlineStrong,
      backgroundColor: colors.surface,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      color: colors.text,
      fontSize: 16,
      width: 90,
      textAlign: 'center',
      fontFamily: fonts.ui,
    },
    buttonRow: {
      flexDirection: 'row',
      gap: 12,
      flexWrap: 'wrap',
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
    signOutCta: {
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.hairlineStrong,
      borderRadius: 22,
      paddingVertical: 18,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 4,
    },
    signOutCtaText: {
      color: colors.error,
      fontSize: 18,
      fontFamily: fonts.ui,
    },
  });
}
