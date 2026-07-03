/**
 * ApprovalOverlay - per-action consent overlay for agent-initiated money moves.
 *
 * Adapted from hermex ApprovalRequestOverlay.swift, scoped to ONCE + DENY
 * (Sean 2026-07-02). Shows the exact command monospaced and selectable, then
 * two choices: Approve once, or Deny. There is no session/always grant.
 *
 * This is presentation only. On Approve it calls `onApprove`, which the screen
 * wires to the SAME confirm navigation that exists today — the overlay never
 * signs, prepares, or routes a transaction itself.
 */

import { Modal, StyleSheet, Text, View } from 'react-native';

import { RegentPressable } from '@/components/ui/RegentPressable';
import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import { CONSENT_CHOICES } from '@/utils/approvalConsent';

const { DARK_BG, CARD_BG, CARD_ALT, BORDER, TEXT_PRIMARY, TEXT_SECONDARY, BLUE, WHITE } = COLORS;

type ApprovalOverlayProps = {
  visible: boolean;
  title: string;
  /** Short plain-English description of what will happen next. */
  body: string;
  /** The exact action command, shown monospaced and selectable. */
  command: string;
  onApprove: () => void;
  onDeny: () => void;
};

export function ApprovalOverlay({
  visible,
  title,
  body,
  command,
  onApprove,
  onDeny,
}: ApprovalOverlayProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDeny}>
      <View style={styles.scrim}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>

          <View style={styles.commandBox}>
            <Text style={styles.commandLabel}>Exact request</Text>
            <Text selectable style={styles.command}>
              {command}
            </Text>
          </View>

          <Text style={styles.note}>
            This approves this one action only. Nothing is remembered — you will be asked again next
            time.
          </Text>

          <View style={styles.actions}>
            {CONSENT_CHOICES.map((choice) => {
              const primary = choice.tone === 'primary';
              return (
                <RegentPressable
                  key={choice.outcome}
                  style={[styles.button, primary ? styles.approveButton : styles.denyButton]}
                  onPress={choice.outcome === 'approve-once' ? onApprove : onDeny}
                >
                  <Text style={primary ? styles.approveText : styles.denyText}>{choice.label}</Text>
                </RegentPressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: DARK_BG,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 22,
    gap: 14,
  },
  title: {
    color: TEXT_PRIMARY,
    fontSize: 22,
    fontFamily: FONTS.heading,
  },
  body: {
    color: TEXT_PRIMARY,
    fontSize: 15,
    lineHeight: 21,
    fontFamily: FONTS.body,
  },
  commandBox: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    gap: 6,
  },
  commandLabel: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    textTransform: 'uppercase',
    fontFamily: FONTS.body,
  },
  command: {
    color: TEXT_PRIMARY,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Courier',
  },
  note: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: FONTS.body,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  button: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveButton: {
    backgroundColor: BLUE,
  },
  denyButton: {
    backgroundColor: CARD_ALT,
    borderWidth: 1,
    borderColor: BORDER,
  },
  approveText: {
    color: WHITE,
    fontSize: 15,
    fontFamily: FONTS.heading,
  },
  denyText: {
    color: TEXT_PRIMARY,
    fontSize: 15,
    fontFamily: FONTS.heading,
  },
});
