import { CoinbaseAlert } from '@/components/ui/CoinbaseAlerts';
import { RegentPressable } from '@/components/ui/RegentPressable';
import { useCoinbaseAlert } from '@/hooks/useCoinbaseAlert';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import {
  gatewayDisplayLabel,
  parsePairingPayload,
  type LocalVoiceGateway,
} from '@/utils/voice/localGateway';
import {
  clearPairedGateway,
  readPairedGateway,
  savePairedGateway,
} from '@/utils/voice/localGatewayStore';
import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, View } from 'react-native';

export default function LocalVoicePairingScreen() {
  const router = useRouter();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { colors } = theme;
  const { alertProps, showAlert } = useCoinbaseAlert();
  const [permission, requestPermission] = useCameraPermissions();
  const [paired, setPaired] = useState<LocalVoiceGateway | null>(null);
  const [scanning, setScanning] = useState(false);
  const handledRef = useRef(false);

  const load = useCallback(async () => {
    setPaired(await readPairedGateway().catch(() => null));
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const beginScan = useCallback(async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        showAlert({
          title: 'Camera access needed',
          message: 'Allow camera access to scan the pairing code from your local Hermes.',
          type: 'info',
        });
        return;
      }
    }
    handledRef.current = false;
    setScanning(true);
  }, [permission, requestPermission, showAlert]);

  const onScanned = useCallback(
    async ({ data }: { data: string }) => {
      if (handledRef.current) {
        return;
      }
      const gateway = parsePairingPayload(data);
      if (!gateway) {
        // Ignore non-pairing codes; keep scanning.
        return;
      }
      handledRef.current = true;
      setScanning(false);
      await savePairedGateway(gateway);
      await load();
      showAlert({
        title: 'Local Hermes connected',
        message: `Voice will use ${gatewayDisplayLabel(gateway)} until you disconnect.`,
        type: 'success',
      });
    },
    [load, showAlert],
  );

  const disconnect = useCallback(async () => {
    await clearPairedGateway();
    await load();
    showAlert({
      title: 'Back to hosted voice',
      message: 'Voice will use your hosted Hermes again.',
      type: 'info',
    });
  }, [load, showAlert]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <RegentPressable pressStyle="icon" onPress={() => router.back()} style={styles.iconButton}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </RegentPressable>
        <Text style={styles.headerTitle}>Local Hermes voice</Text>
        <View style={styles.iconButton} />
      </View>

      <View style={styles.body}>
        <Text style={styles.intro}>
          Run `regents voice serve` on your computer, then scan the QR code it shows to use your own
          Hermes for voice.
        </Text>

        {scanning ? (
          <View style={styles.scannerCard}>
            <CameraView
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={({ data }) => void onScanned({ data })}
            />
            <RegentPressable style={styles.secondaryButton} onPress={() => setScanning(false)}>
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </RegentPressable>
          </View>
        ) : paired ? (
          <View style={styles.statusCard}>
            <View style={styles.statusRow}>
              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
              <Text style={styles.statusText}>Connected to {gatewayDisplayLabel(paired)}</Text>
            </View>
            <Text style={styles.statusHint}>Voice uses this local Hermes until you disconnect.</Text>
            <View style={styles.actions}>
              <RegentPressable style={styles.primaryButton} onPress={beginScan}>
                <Text style={styles.primaryButtonText}>Re-scan</Text>
              </RegentPressable>
              <RegentPressable style={styles.secondaryButton} onPress={disconnect}>
                <Text style={styles.secondaryButtonText}>Disconnect</Text>
              </RegentPressable>
            </View>
          </View>
        ) : (
          <View style={styles.statusCard}>
            <Text style={styles.statusHint}>No local Hermes paired. Voice uses your hosted Hermes.</Text>
            <RegentPressable style={styles.primaryButton} onPress={beginScan}>
              {permission === null ? (
                <ActivityIndicator color={colors.onAccent} size="small" />
              ) : (
                <Text style={styles.primaryButtonText}>Scan pairing code</Text>
              )}
            </RegentPressable>
          </View>
        )}
      </View>

      <CoinbaseAlert {...alertProps} />
    </SafeAreaView>
  );
}

/**
 * Theme-derived styles. Recomputed only when the theme changes (memoized by
 * the caller). This is the canonical pattern for the rollout: a makeStyles(theme)
 * factory reading semantic tokens, never raw hex.
 */
function makeStyles({ colors, fonts, type, space, radius }: Theme) {
  return StyleSheet.create({
    // Near-black ground in dark; hueless near-white in light. Never tinted.
    container: { flex: 1, backgroundColor: colors.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: space.s5,
      paddingTop: space.s3,
      paddingBottom: space.s2,
      // Hairline separator mixed from the foreground, not a solid border.
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.hairline,
    },
    iconButton: {
      width: 40,
      height: 40,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // Pixel display face for the header.
    headerTitle: { color: colors.text, fontSize: type.headline.size, fontFamily: fonts.title },
    body: { paddingHorizontal: space.s5, paddingTop: space.s4, gap: space.s4 },
    intro: {
      color: colors.textMuted,
      fontSize: type.label.size,
      lineHeight: type.label.line,
      fontFamily: fonts.ui,
    },
    // Glass card that sits over the near-black ground: elevated surface,
    // hairline inset ring.
    scannerCard: {
      backgroundColor: colors.surfaceElevated,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.hairlineStrong,
      borderRadius: radius.lg,
      padding: space.s4,
      gap: space.s3,
    },
    camera: { width: '100%', aspectRatio: 1, borderRadius: radius.md, overflow: 'hidden' },
    statusCard: {
      backgroundColor: colors.surfaceElevated,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.hairlineStrong,
      borderRadius: radius.lg,
      padding: space.s4,
      gap: space.s3,
    },
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: space.s2 },
    statusText: { color: colors.text, fontSize: type.body.size, fontFamily: fonts.title },
    statusHint: {
      color: colors.textMuted,
      fontSize: type.label.size,
      lineHeight: type.label.line,
      fontFamily: fonts.ui,
    },
    actions: { flexDirection: 'row', gap: space.s2 },
    // One accent per surface (regent blue).
    primaryButton: {
      minWidth: 140,
      backgroundColor: colors.accent,
      borderRadius: radius.md,
      paddingHorizontal: space.s4,
      paddingVertical: space.s3,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryButtonText: { color: colors.onAccent, fontSize: type.label.size, fontFamily: fonts.ui },
    secondaryButton: {
      minWidth: 120,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      paddingHorizontal: space.s4,
      paddingVertical: space.s3,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.hairlineStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryButtonText: { color: colors.text, fontSize: type.label.size, fontFamily: fonts.ui },
  });
}
