/**
 * FailedTransactionCard - Error UI for failed transactions
 *
 * Displays error message and provides easy access to support.
 * Matches the Coinbase Onramp error screen design.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { RegentPressable } from './RegentPressable';
import { runRegentHaptic } from './haptics';
import {
  createDebugInfoFromTransaction,
  GuestCheckoutDebugInfo,
  openSupportEmail,
  SUPPORT_EMAIL,
  TransactionDebugInfo
} from '../../utils/supportEmail';

interface FailedTransactionCardProps {
  title?: string;
  message?: string;
  transaction?: {
    transaction_id?: string;
    status?: string;
    purchase_currency?: string;
    purchase_network?: string;
    purchase_amount?: { value?: string; currency?: string } | string;
    payment_total?: { value?: string; currency?: string };
    payment_method?: string;
    wallet_address?: string;
    tx_hash?: string;
    created_at?: string;
    partner_user_ref?: string;
  };
  debugInfo?: TransactionDebugInfo | GuestCheckoutDebugInfo;
  errorMessage?: string;
  onDismiss?: () => void;
  showDismiss?: boolean;
}

export function FailedTransactionCard({
  title = 'An error occurred',
  message = "We're looking into it right now. Please try again later.",
  transaction,
  debugInfo,
  errorMessage,
  onDismiss,
  showDismiss = true,
}: FailedTransactionCardProps) {
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);
  // Use provided debugInfo or create from transaction
  const finalDebugInfo = debugInfo || (transaction
    ? createDebugInfoFromTransaction(transaction, errorMessage)
    : undefined);

  const handleContactSupport = async () => {
    let opened = false;
    if (finalDebugInfo) {
      opened = await openSupportEmail(finalDebugInfo);
    } else {
      opened = await openSupportEmail({
        flowType: 'guest',
        partnerName: 'Regents Mobile',
        errorMessage: errorMessage || message,
      } as GuestCheckoutDebugInfo);
    }

    runRegentHaptic(opened ? 'success' : 'warning');
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>{title}</Text>

        {/* Error illustration - using Ionicons as fallback */}
        <View style={styles.illustrationContainer}>
          <View style={styles.illustration}>
            <Ionicons name="alert-circle" size={80} color="#FF6B6B" />
          </View>
        </View>

        <Text style={styles.heading}>Something went wrong</Text>
        <Text style={styles.message}>{message}</Text>

        {/* Support contact section */}
        <View style={styles.supportSection}>
          <Text style={styles.contactText}>
            Contact{' '}
            <Text style={styles.emailLink} onPress={handleContactSupport}>
              {SUPPORT_EMAIL}
            </Text>
            {' '}for support.
          </Text>
          <Text style={styles.responseTime}>
            We&apos;ll resolve the issue within 1 business day.
          </Text>
        </View>

        {/* Action buttons */}
        <View style={styles.buttonContainer}>
          <RegentPressable
            onPress={handleContactSupport}
            style={styles.primaryButton}
          >
            <Ionicons name="mail-outline" size={20} color={colors.onAccent} />
            <Text style={styles.primaryButtonText}>Email support</Text>
          </RegentPressable>

          {showDismiss && onDismiss && (
            <RegentPressable
              onPress={onDismiss}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>Dismiss</Text>
            </RegentPressable>
          )}
        </View>

        {/* Secure flow footer */}
        <View style={styles.footer}>
          <Ionicons name="lock-closed" size={14} color={colors.textMuted} />
          <Text style={styles.footerText}>Secure transfer flow</Text>
        </View>
      </View>
    </View>
  );
}

/**
 * Compact version for inline display in transaction lists
 */
export function FailedTransactionBadge({
  transaction,
  onPress,
}: {
  transaction: {
    transaction_id?: string;
    status?: string;
    purchase_currency?: string;
    purchase_network?: string;
    purchase_amount?: { value?: string; currency?: string } | string;
    payment_total?: { value?: string; currency?: string };
    payment_method?: string;
    wallet_address?: string;
    tx_hash?: string;
    created_at?: string;
    partner_user_ref?: string;
  };
  onPress?: () => void;
}) {
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const handlePress = async () => {
    if (onPress) {
      onPress();
    } else {
      const debugInfo = createDebugInfoFromTransaction(transaction);
      await openSupportEmail(debugInfo);
    }
  };

  return (
    <RegentPressable
      onPress={handlePress}
      pressStyle="chip"
      style={styles.badge}
    >
      <Ionicons name="mail-outline" size={14} color={colors.accent} />
      <Text style={styles.badgeText}>Get help</Text>
    </RegentPressable>
  );
}

function makeStyles({ colors, fonts }: Theme) {
  return StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: colors.bg,
  },
  card: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 4,
  },
  title: {
    fontSize: 14,
    color: colors.accent,
    marginBottom: 20,
    fontFamily: fonts.ui,
  },
  illustrationContainer: {
    marginBottom: 20,
  },
  illustration: {
    width: 104,
    height: 104,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderRadius: 52,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
  },
  heading: {
    fontSize: 20,
    color: colors.text,
    marginBottom: 8,
    textAlign: 'center',
    fontFamily: fonts.title,
  },
  message: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
    fontFamily: fonts.ui,
  },
  supportSection: {
    alignItems: 'center',
    marginBottom: 20,
    padding: 14,
    backgroundColor: colors.accentWash,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    width: '100%',
  },
  contactText: {
    fontSize: 14,
    color: colors.text,
    textAlign: 'center',
    fontFamily: fonts.ui,
  },
  emailLink: {
    color: colors.accent,
    textDecorationLine: 'none',
  },
  responseTime: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
    fontFamily: fonts.ui,
  },
  buttonContainer: {
    width: '100%',
    gap: 12,
  },
  primaryButton: {
    backgroundColor: colors.accent,
    paddingVertical: 15,
    paddingHorizontal: 24,
    borderRadius: 18,
    minHeight: 52,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryButtonText: {
    color: colors.onAccent,
    fontSize: 15,
    fontFamily: fonts.ui,
  },
  secondaryButton: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 18,
    minHeight: 50,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    backgroundColor: colors.surface,
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: 15,
    fontFamily: fonts.ui,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.hairlineStrong,
    width: '100%',
    justifyContent: 'center',
  },
  footerText: {
    fontSize: 12,
    color: colors.textMuted,
    fontFamily: fonts.ui,
  },
  // Badge styles for compact inline display
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    marginTop: 8,
  },
  badgeText: {
    fontSize: 12,
    color: colors.accent,
    fontFamily: fonts.ui,
  },
  });
}
