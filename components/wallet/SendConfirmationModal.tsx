/**
 * Review-and-confirm modal for the send flow. Owns its own presentation state
 * so the exit animation finishes before the native modal unmounts.
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { EaseView } from 'react-native-ease';

import { RegentPressable } from '@/components/ui/RegentPressable';
import {
  SEND_CARD_OFFSET,
  SEND_SCREEN_OFFSET,
  SEND_STAGGER_STEP,
  buildSpringTransition,
  buildTimingTransition,
} from '@/components/wallet/sendTransitions';
import { useTheme, type Theme } from '@/theme/ThemeProvider';

export function SendConfirmationModal({
  visible,
  reduceMotion,
  isAgentFundingFlow,
  isDefaultSendFlow,
  fundingTarget,
  fromAddressPreview,
  recipientAddress,
  networkDisplayName,
  tokenSymbol,
  amount,
  usdEstimate,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  reduceMotion: boolean;
  isAgentFundingFlow: boolean;
  isDefaultSendFlow: boolean;
  fundingTarget: string;
  fromAddressPreview: string;
  recipientAddress: string;
  networkDisplayName: string;
  tokenSymbol?: string;
  amount: string;
  usdEstimate: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [isPresented, setIsPresented] = useState(false);

  useEffect(() => {
    if (visible) {
      setIsPresented(true);
    }
  }, [visible]);

  return (
    <Modal
      visible={isPresented}
      transparent
      animationType="none"
      onRequestClose={onCancel}
    >
      <EaseView
        initialAnimate={{ opacity: 0 }}
        animate={{ opacity: visible ? 1 : 0 }}
        transition={buildTimingTransition(reduceMotion, 0, 180)}
        style={styles.modalOverlay}
      >
        <EaseView
          initialAnimate={{ opacity: 0, translateY: SEND_SCREEN_OFFSET, scale: 0.985 }}
          animate={{ opacity: visible ? 1 : 0, translateY: visible ? 0 : SEND_SCREEN_OFFSET, scale: visible ? 1 : 0.985 }}
          onTransitionEnd={({ finished }) => {
            if (finished && !visible) {
              setIsPresented(false);
            }
          }}
          transition={buildSpringTransition(reduceMotion, 30)}
          style={styles.confirmationCard}
        >
          <EaseView
            initialAnimate={{ opacity: 0, translateY: SEND_CARD_OFFSET }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={buildTimingTransition(reduceMotion, SEND_STAGGER_STEP)}
            style={styles.confirmationHeader}
          >
            <Ionicons name="shield-checkmark" size={48} color={colors.accent} />
            <Text style={styles.confirmationTitle}>{isAgentFundingFlow || isDefaultSendFlow ? 'Review payment' : 'Review send'}</Text>
          </EaseView>

          <EaseView
            initialAnimate={{ opacity: 0, translateY: SEND_CARD_OFFSET }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={buildTimingTransition(reduceMotion, SEND_STAGGER_STEP * 2)}
            style={styles.confirmationBody}
          >
            <View style={styles.confirmRow}>
              <Text style={styles.confirmLabel}>From</Text>
              <Text style={styles.confirmValue} numberOfLines={1}>
                {fromAddressPreview}
              </Text>
            </View>

            <View style={styles.confirmRow}>
              <Text style={styles.confirmLabel}>{isAgentFundingFlow ? 'Agent' : 'To'}</Text>
              <Text style={styles.confirmValue} numberOfLines={1}>
                {isAgentFundingFlow ? fundingTarget : `${recipientAddress.slice(0, 6)}...${recipientAddress.slice(-4)}`}
              </Text>
            </View>

            {isAgentFundingFlow ? (
              <View style={styles.confirmRow}>
                <Text style={styles.confirmLabel}>Agent wallet</Text>
                <Text style={styles.confirmValue} numberOfLines={1}>
                  {recipientAddress.slice(0, 6)}...{recipientAddress.slice(-4)}
                </Text>
              </View>
            ) : null}

            <View style={styles.confirmRow}>
              <Text style={styles.confirmLabel}>Network</Text>
              <Text style={styles.confirmValue}>
                {networkDisplayName}
              </Text>
            </View>

            <View style={styles.confirmRow}>
              <Text style={styles.confirmLabel}>{isAgentFundingFlow ? 'Funds' : 'Token'}</Text>
              <Text style={styles.confirmValue}>
                {tokenSymbol || 'Unknown'}
              </Text>
            </View>

            <View style={[styles.confirmRow, styles.confirmAmount]}>
              <Text style={styles.confirmLabel}>Amount</Text>
              <Text style={styles.confirmAmountValue}>
                {amount} {tokenSymbol}
              </Text>
            </View>

            {usdEstimate ? (
              <Text style={styles.confirmUsd}>
                About ${usdEstimate} USD
              </Text>
            ) : null}
          </EaseView>

          <EaseView
            initialAnimate={{ opacity: 0, translateY: SEND_CARD_OFFSET }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={buildTimingTransition(reduceMotion, SEND_STAGGER_STEP * 3)}
            style={styles.confirmationButtons}
          >
            <RegentPressable
              style={[styles.confirmButton, styles.cancelButton]}
              onPress={onCancel}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </RegentPressable>
            <RegentPressable
              haptic="warning"
              style={[styles.confirmButton, styles.sendButton]}
              onPress={onConfirm}
            >
              <Text style={styles.sendButtonText}>{isAgentFundingFlow ? 'Send to agent' : isDefaultSendFlow ? 'Pay now' : 'Send now'}</Text>
            </RegentPressable>
          </EaseView>
        </EaseView>
      </EaseView>
    </Modal>
  );
}

function makeStyles({ colors, fonts }: Theme) {
  return StyleSheet.create({
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(49, 85, 105, 0.16)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    confirmationCard: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: 20,
      width: '100%',
      maxWidth: 400,
      borderWidth: 1,
      borderColor: colors.hairlineStrong,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.3,
      shadowRadius: 20,
      elevation: 10,
    },
    confirmationHeader: {
      alignItems: 'center',
      padding: 22,
      borderBottomWidth: 1,
      borderBottomColor: colors.hairlineStrong,
    },
    confirmationTitle: {
      fontSize: 22,
      color: colors.text,
      marginTop: 12,
      fontFamily: fonts.title,
    },
    confirmationBody: {
      padding: 22,
      gap: 14,
    },
    confirmRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 8,
    },
    confirmLabel: {
      fontSize: 14,
      color: colors.textMuted,
      fontFamily: fonts.ui,
    },
    confirmValue: {
      fontSize: 14,
      color: colors.text,
      flex: 1,
      textAlign: 'right',
      marginLeft: 16,
      fontFamily: fonts.ui,
    },
    confirmAmount: {
      paddingTop: 16,
      borderTopWidth: 1,
      borderTopColor: colors.hairlineStrong,
      marginTop: 8,
    },
    confirmAmountValue: {
      fontSize: 20,
      color: colors.accent,
      lineHeight: 26,
      flexShrink: 1,
      fontFamily: fonts.title,
    },
    confirmUsd: {
      fontSize: 14,
      color: colors.textMuted,
      textAlign: 'right',
      marginTop: -8,
      fontFamily: fonts.ui,
    },
    confirmationButtons: {
      flexDirection: 'row',
      padding: 18,
      gap: 12,
      flexWrap: 'wrap',
      borderTopWidth: 1,
      borderTopColor: colors.hairlineStrong,
    },
    confirmButton: {
      flex: 1,
      minWidth: 130,
      minHeight: 52,
      paddingVertical: 14,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelButton: {
      backgroundColor: colors.hairlineStrong,
    },
    sendButton: {
      backgroundColor: colors.accent,
    },
    cancelButtonText: {
      fontSize: 16,
      color: colors.text,
      fontFamily: fonts.ui,
    },
    sendButtonText: {
      fontSize: 16,
      color: colors.onAccent,
      fontFamily: fonts.ui,
    },
  });
}
