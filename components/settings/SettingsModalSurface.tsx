import { getEaseTransition } from '@/components/motion/easePresets';
import { useReducedMotion } from '@/components/motion/useReducedMotion';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { EaseView } from 'react-native-ease';

type SettingsModalSurfaceProps = {
  children: ReactNode;
  onRequestClose: () => void;
  visible: boolean;
};

export function SettingsModalSurface({
  children,
  onRequestClose,
  visible,
}: SettingsModalSurfaceProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const reducedMotionEnabled = useReducedMotion();
  const [isPresented, setIsPresented] = useState(visible);

  useEffect(() => {
    if (visible) {
      setIsPresented(true);
    }
  }, [visible]);

  return (
    <Modal visible={isPresented} transparent animationType="none" onRequestClose={onRequestClose}>
      <View style={styles.modalOverlay}>
        <EaseView
          initialAnimate={{ opacity: 0 }}
          animate={{ opacity: visible ? 1 : 0 }}
          style={StyleSheet.absoluteFillObject}
          transition={getEaseTransition('card', reducedMotionEnabled)}
        >
          <Pressable style={StyleSheet.absoluteFillObject} onPress={onRequestClose} />
        </EaseView>

        <EaseView
          initialAnimate={{ opacity: 0, translateY: 8, scale: 0.985 }}
          animate={{ opacity: visible ? 1 : 0, translateY: visible ? 0 : 8, scale: visible ? 1 : 0.985 }}
          onTransitionEnd={({ finished }) => {
            if (finished && !visible) {
              setIsPresented(false);
            }
          }}
          style={styles.modalCard}
          transition={getEaseTransition('emphasis', reducedMotionEnabled)}
        >
          {children}
        </EaseView>
      </View>
    </Modal>
  );
}

function makeStyles({ colors }: Theme) {
  return StyleSheet.create({
    modalOverlay: {
      flex: 1,
      backgroundColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    },
    modalCard: {
      width: '100%',
      maxWidth: 420,
      backgroundColor: colors.surfaceElevated,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: colors.hairlineStrong,
      padding: 20,
      gap: 16,
    },
  });
}
