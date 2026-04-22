import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { EaseView } from 'react-native-ease';
import { COLORS } from '../../constants/Colors';
import { FONTS } from '../../constants/Typography';
import { getEaseTransition } from '@/components/motion/easePresets';
import { useReducedMotion } from '@/components/motion/useReducedMotion';

const { BLUE, CARD_BG, CARD_ALT, BORDER, TEXT_PRIMARY, TEXT_SECONDARY, WHITE, SUCCESS, DANGER, BACKDROP } = COLORS;

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
  const reducedMotionEnabled = useReducedMotion();
  const [isPresented, setIsPresented] = useState(visible);

  const getIcon = () => {
    switch (type) {
      case 'success': return { name: 'checkmark-circle' as const, color: SUCCESS };
      case 'error': return { name: 'close-circle' as const, color: DANGER };
      case 'info': return { name: 'information-circle' as const, color: BLUE };
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
          style={[StyleSheet.absoluteFillObject, { backgroundColor: BACKDROP }]}
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
                  <Pressable
                    style={({ pressed }) => [styles.buttonSecondary, pressed && styles.buttonPressed]}
                    onPress={onCancel}
                  >
                    <Text style={styles.buttonTextSecondary}>{cancelText}</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [styles.buttonInRow, pressed && styles.buttonPressed]}
                    onPress={onConfirm}
                  >
                    <Text style={styles.buttonText}>{confirmText}</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
                  onPress={onConfirm}
                >
                  <Text style={styles.buttonText}>{confirmText}</Text>
                </Pressable>
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

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  alertCard: {
    backgroundColor: CARD_BG,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 34,
    minHeight: 220,
    maxHeight: '85%',
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: CARD_ALT,
    borderRadius: 2,
    marginBottom: 20,
    alignSelf: 'center',
  },
  iconContainer: {
    marginBottom: 16,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    color: TEXT_PRIMARY,
    marginBottom: 8,
    textAlign: 'center',
    fontFamily: FONTS.heading,
  },
  message: {
    fontSize: 16,
    color: TEXT_SECONDARY,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
    paddingHorizontal: 16,
    fontFamily: FONTS.body,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    paddingHorizontal: 16,
    justifyContent: 'space-between',
  },
  button: {
    backgroundColor: BLUE,
    paddingHorizontal: 48,
    paddingVertical: 16,
    borderRadius: 16,
    minWidth: 200,
    alignSelf: 'center',
  },
  buttonInRow: {
    backgroundColor: BLUE,
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 16,
    flex: 1,
    minWidth: 120,
  },
  buttonSecondary: {
    backgroundColor: CARD_ALT,
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    flex: 1,
    minWidth: 120,
  },
  buttonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  buttonText: {
    color: WHITE,
    fontSize: 18,
    textAlign: 'center',
    fontFamily: FONTS.body,
  },
  buttonTextSecondary: {
    color: TEXT_PRIMARY,
    fontSize: 18,
    textAlign: 'center',
    fontFamily: FONTS.body,
  },
});
