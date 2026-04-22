/**
 * FailedTransactionCard - Error UI for failed transactions
 *
 * Displays error message and provides easy access to support.
 * Matches the Coinbase Onramp error screen design.
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../../constants/Colors';
import { FONTS } from '../../constants/Typography';
import {
  createDebugInfoFromTransaction,
  GuestCheckoutDebugInfo,
  openSupportEmail,
  SUPPORT_EMAIL,
  TransactionDebugInfo
} from '../../utils/supportEmail';

const { BLUE, BORDER, CARD_BG, CARD_ALT, BLUE_WASH, TEXT_PRIMARY, TEXT_SECONDARY, WHITE, DARK_BG } = COLORS;

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
  // Use provided debugInfo or create from transaction
  const finalDebugInfo = debugInfo || (transaction
    ? createDebugInfoFromTransaction(transaction, errorMessage)
    : undefined);

  const handleContactSupport = async () => {
    if (finalDebugInfo) {
      await openSupportEmail(finalDebugInfo);
    } else {
      // Fallback - open email with minimal info
      await openSupportEmail({
        flowType: 'guest',
        partnerName: 'Regents Mobile',
        errorMessage: errorMessage || message,
      } as GuestCheckoutDebugInfo);
    }
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
          <Pressable
            onPress={handleContactSupport}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Ionicons name="mail-outline" size={20} color={WHITE} />
            <Text style={styles.primaryButtonText}>Email Support</Text>
          </Pressable>

          {showDismiss && onDismiss && (
            <Pressable
              onPress={onDismiss}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.secondaryButtonText}>Dismiss</Text>
            </Pressable>
          )}
        </View>

        {/* Secure flow footer */}
        <View style={styles.footer}>
          <Ionicons name="lock-closed" size={14} color={TEXT_SECONDARY} />
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
  const handlePress = async () => {
    if (onPress) {
      onPress();
    } else {
      const debugInfo = createDebugInfoFromTransaction(transaction);
      await openSupportEmail(debugInfo);
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.badge,
        pressed && styles.badgePressed,
      ]}
    >
      <Ionicons name="mail-outline" size={14} color={BLUE} />
      <Text style={styles.badgeText}>Get Help</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: DARK_BG,
  },
  card: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    shadowColor: BLUE,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 4,
  },
  title: {
    fontSize: 14,
    color: BLUE,
    marginBottom: 20,
    fontFamily: FONTS.body,
  },
  illustrationContainer: {
    marginBottom: 20,
  },
  illustration: {
    width: 104,
    height: 104,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: WHITE,
    borderRadius: 52,
    borderWidth: 1,
    borderColor: BORDER,
  },
  heading: {
    fontSize: 20,
    color: TEXT_PRIMARY,
    marginBottom: 8,
    textAlign: 'center',
    fontFamily: FONTS.heading,
  },
  message: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
    fontFamily: FONTS.body,
  },
  supportSection: {
    alignItems: 'center',
    marginBottom: 20,
    padding: 14,
    backgroundColor: BLUE_WASH,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    width: '100%',
  },
  contactText: {
    fontSize: 14,
    color: TEXT_PRIMARY,
    textAlign: 'center',
    fontFamily: FONTS.body,
  },
  emailLink: {
    color: BLUE,
    textDecorationLine: 'none',
  },
  responseTime: {
    fontSize: 12,
    color: TEXT_SECONDARY,
    marginTop: 4,
    fontFamily: FONTS.body,
  },
  buttonContainer: {
    width: '100%',
    gap: 12,
  },
  primaryButton: {
    backgroundColor: BLUE,
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
    color: WHITE,
    fontSize: 15,
    fontFamily: FONTS.body,
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
    borderColor: BORDER,
    backgroundColor: CARD_ALT,
  },
  secondaryButtonText: {
    color: TEXT_PRIMARY,
    fontSize: 15,
    fontFamily: FONTS.body,
  },
  buttonPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    width: '100%',
    justifyContent: 'center',
  },
  footerText: {
    fontSize: 12,
    color: TEXT_SECONDARY,
    fontFamily: FONTS.body,
  },
  // Badge styles for compact inline display
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: CARD_BG,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    marginTop: 8,
  },
  badgePressed: {
    opacity: 0.84,
  },
  badgeText: {
    fontSize: 12,
    color: BLUE,
    fontFamily: FONTS.body,
  },
});
