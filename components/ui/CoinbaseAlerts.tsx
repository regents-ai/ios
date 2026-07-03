import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { EaseView } from 'react-native-ease';
import { getEaseTransition } from '@/components/motion/easePresets';
import { useReducedMotion } from '@/components/motion/useReducedMotion';
import { RegentPressable } from '@/components/ui/RegentPressable';
import { useTheme, type Theme } from '@/theme/ThemeProvider';

type AlertType = 'success' | 'error' | 'info';

type CoinbaseAlertProps = {
  visible: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  confirmText?: string;
  type?: AlertType;
  onCancel?: () => void;
  cancelText?: string;
  hideButton?: boolean; // Hide the button (for non-dismissible alerts like pending transactions)
};

export function CoinbaseAlert({
  visible,
  title,
  message,
  onConfirm,
  confirmText = "Got it",
  type = 'success',
  onCancel,
  cancelText = "Cancel",
  hideButton = false
}: CoinbaseAlertProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { colors } = theme;
  const reducedMotionEnabled = useReducedMotion();
  const [isPresented, setIsPresented] = useState(visible);

  const getIcon = () => {
    switch (type) {
      case 'success': return { name: 'checkmark-circle' as const, color: colors.success };
      case 'error': return { name: 'close-circle' as const, color: colors.error };
      case 'info': return { name: 'information-circle' as const, color: colors.accent };
    }
  };

  const icon = getIcon();

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
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={onConfirm}
    >
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'transparent' }}>
        <EaseView
          initialAnimate={{ opacity: 0 }}
          animate={{ opacity: visible ? 1 : 0 }}
          style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0, 0, 0, 0.45)' }]}
          transition={getEaseTransition('card', reducedMotionEnabled)}
        >
          <Pressable style={StyleSheet.absoluteFillObject} onPress={onConfirm} />
        </EaseView>

        <EaseView
          initialAnimate={{ opacity: 0, translateY: 20 }}
          animate={{ opacity: visible ? 1 : 0, translateY: visible ? 0 : 20 }}
          onTransitionEnd={({ finished }) => {
            if (finished && !visible) {
              setIsPresented(false);
            }
          }}
          style={[styles.alertCard, { width: '100%' }]}
          transition={getEaseTransition('sheet', reducedMotionEnabled)}
        >
          <View style={styles.handle} />
          <View style={styles.iconContainer}>
            <Ionicons name={icon.name} size={48} color={icon.color} />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

          {!hideButton && (
            <>
              {onCancel ? (
                <View style={styles.buttonRow}>
                  <RegentPressable
                    style={styles.buttonSecondary}
                    onPress={onCancel}
                  >
                    <Text style={styles.buttonTextSecondary}>{cancelText}</Text>
                  </RegentPressable>
                  <RegentPressable
                    style={styles.buttonInRow}
                    onPress={onConfirm}
                  >
                    <Text style={styles.buttonText}>{confirmText}</Text>
                  </RegentPressable>
                </View>
              ) : (
                <RegentPressable
                  style={styles.button}
                  onPress={onConfirm}
                >
                  <Text style={styles.buttonText}>{confirmText}</Text>
                </RegentPressable>
              )}
            </>
          )}
        </EaseView>
      </View>
    </Modal>
  );
}

// Quick alert for simple messages
export function showCoinbaseAlert(
  title: string, 
  message: string, 
  type: AlertType = 'info'
): Promise<void> {
  return new Promise((resolve) => {
    // This would need a global alert manager, but for now we'll use the component approach
    resolve();
  });
}

function makeStyles({ colors, fonts, type }: Theme) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'flex-end',
    },
    alertCard: {
      backgroundColor: colors.surfaceElevated,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.hairlineStrong,
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 34,
      minHeight: 220,
      maxHeight: '85%',
    },
    handle: {
      width: 36,
      height: 4,
      backgroundColor: colors.border,
      borderRadius: 2,
      marginBottom: 20,
      alignSelf: 'center',
    },
    iconContainer: {
      marginBottom: 16,
      alignItems: 'center',
    },
    title: {
      fontSize: type.title.size,
      color: colors.text,
      marginBottom: 8,
      textAlign: 'center',
      fontFamily: fonts.title,
    },
    message: {
      fontSize: type.body.size,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: type.body.line,
      marginBottom: 32,
      paddingHorizontal: 16,
      fontFamily: fonts.ui,
    },
    buttonRow: {
      flexDirection: 'row',
      gap: 12,
      width: '100%',
      paddingHorizontal: 16,
      justifyContent: 'space-between',
    },
    button: {
      backgroundColor: colors.accent,
      paddingHorizontal: 48,
      paddingVertical: 16,
      borderRadius: 16,
      minWidth: 200,
      alignSelf: 'center',
    },
    buttonInRow: {
      backgroundColor: colors.accent,
      paddingHorizontal: 24,
      paddingVertical: 16,
      borderRadius: 16,
      flex: 1,
      minWidth: 120,
    },
    buttonSecondary: {
      backgroundColor: colors.surface,
      paddingHorizontal: 24,
      paddingVertical: 16,
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.hairlineStrong,
      flex: 1,
      minWidth: 120,
    },
    buttonText: {
      color: colors.onAccent,
      fontSize: 18,
      textAlign: 'center',
      fontFamily: fonts.ui,
    },
    buttonTextSecondary: {
      color: colors.text,
      fontSize: 18,
      textAlign: 'center',
      fontFamily: fonts.ui,
    },
  });
}
