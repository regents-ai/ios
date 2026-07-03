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

import { useMemo } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';

import { RegentPressable } from '@/components/ui/RegentPressable';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { CONSENT_CHOICES } from '@/utils/approvalConsent';

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
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
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

function makeStyles({ colors, fonts, type }: Theme) {
  return StyleSheet.create({
    scrim: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
    },
    // Modal card = elevated surface (not the page ground), hairline ring.
    card: {
      width: '100%',
      maxWidth: 420,
      backgroundColor: colors.surfaceElevated,
      borderRadius: 24,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.hairlineStrong,
      padding: 22,
      gap: 14,
    },
    title: {
      color: colors.text,
      fontSize: type.title.size,
      fontFamily: fonts.title,
    },
    body: {
      color: colors.text,
      fontSize: type.body.size,
      lineHeight: type.body.line,
      fontFamily: fonts.ui,
    },
    // The exact command sits in a recessed surface with a mono readout.
    commandBox: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.hairline,
      padding: 14,
      gap: 6,
    },
    commandLabel: {
      color: colors.textMuted,
      fontSize: type.caption.size,
      letterSpacing: 1,
      textTransform: 'uppercase',
      fontFamily: fonts.ui,
    },
    command: {
      color: colors.text,
      fontSize: type.code.size,
      lineHeight: type.code.line,
      fontFamily: 'Courier',
    },
    note: {
      color: colors.textMuted,
      fontSize: type.caption.size,
      lineHeight: type.caption.line,
      fontFamily: fonts.ui,
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
      backgroundColor: colors.accent,
    },
    denyButton: {
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.hairlineStrong,
    },
    approveText: {
      color: colors.onAccent,
      fontSize: type.label.size,
      fontFamily: fonts.title,
    },
    denyText: {
      color: colors.text,
      fontSize: type.label.size,
      fontFamily: fonts.title,
    },
  });
}
