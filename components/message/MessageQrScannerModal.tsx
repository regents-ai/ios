import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, View } from 'react-native';

import { RegentPressable } from '@/components/ui/RegentPressable';
import { useTheme, type Theme } from '@/theme/ThemeProvider';

type MessageQrScannerModalProps = {
  visible: boolean;
  onClose: () => void;
  onScanned: (payload: string) => void;
  onUnavailable: () => void;
};

export function MessageQrScannerModal({
  onClose,
  onScanned,
  onUnavailable,
  visible,
}: MessageQrScannerModalProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { colors } = theme;
  const [permission, requestPermission] = useCameraPermissions();
  const handledRef = useRef(false);
  const requestingPermissionRef = useRef(false);

  useEffect(() => {
    if (!visible) {
      handledRef.current = false;
      return;
    }
    if (permission?.granted || requestingPermissionRef.current) {
      return;
    }

    requestingPermissionRef.current = true;
    requestPermission()
      .then((result) => {
        if (!result.granted) {
          onClose();
          onUnavailable();
        }
      })
      .catch(() => {
        onClose();
        onUnavailable();
      })
      .finally(() => {
        requestingPermissionRef.current = false;
      });
  }, [onClose, onUnavailable, permission?.granted, requestPermission, visible]);

  const handleScanned = ({ data }: { data: string }) => {
    if (handledRef.current || !data) {
      return;
    }
    handledRef.current = true;
    onClose();
    onScanned(data);
  };

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={visible}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerSpacer} />
          <Text style={styles.title}>Scan QR code</Text>
          <RegentPressable
            accessibilityLabel="Close QR scanner"
            pressStyle="icon"
            onPress={onClose}
            style={styles.closeButton}
          >
            <Ionicons name="close" size={22} color={colors.text} />
          </RegentPressable>
        </View>

        <Text style={styles.hint}>Point the camera at a QR code to add its text to your draft.</Text>

        <View style={styles.scanner}>
          {permission?.granted ? (
            <CameraView
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              facing="back"
              onBarcodeScanned={handleScanned}
              style={StyleSheet.absoluteFill}
            />
          ) : (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.loadingText}>Opening camera…</Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

function makeStyles({ colors, fonts, radius, space, type }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg,
      paddingHorizontal: space.s5,
      paddingTop: space.s4,
      gap: space.s4,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    headerSpacer: {
      width: 40,
    },
    title: {
      color: colors.text,
      fontFamily: fonts.title,
      fontSize: type.headline.size,
    },
    closeButton: {
      width: 40,
      height: 40,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceElevated,
    },
    hint: {
      color: colors.textMuted,
      fontFamily: fonts.ui,
      fontSize: type.label.size,
      lineHeight: type.label.line,
      textAlign: 'center',
    },
    scanner: {
      width: '100%',
      aspectRatio: 1,
      overflow: 'hidden',
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.hairlineStrong,
      backgroundColor: colors.surfaceElevated,
    },
    loading: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: space.s2,
    },
    loadingText: {
      color: colors.textMuted,
      fontFamily: fonts.ui,
      fontSize: type.label.size,
    },
  });
}
