import { CoinbaseAlert } from '@/components/ui/CoinbaseAlerts';
import { RegentPressable } from '@/components/ui/RegentPressable';
import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import { useCoinbaseAlert } from '@/hooks/useCoinbaseAlert';
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
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, View } from 'react-native';

const { DARK_BG, CARD_BG, CARD_ALT, TEXT_PRIMARY, TEXT_SECONDARY, BLUE, BORDER, WHITE, SUCCESS } = COLORS;

export default function LocalVoicePairingScreen() {
  const router = useRouter();
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
          <Ionicons name="chevron-back" size={22} color={TEXT_PRIMARY} />
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
              <Ionicons name="checkmark-circle" size={20} color={SUCCESS} />
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
                <ActivityIndicator color={WHITE} size="small" />
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DARK_BG },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { color: TEXT_PRIMARY, fontSize: 20, fontFamily: FONTS.heading },
  body: { paddingHorizontal: 20, gap: 16 },
  intro: { color: TEXT_SECONDARY, fontSize: 14, lineHeight: 20, fontFamily: FONTS.body },
  scannerCard: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 20,
    padding: 16,
    gap: 12,
  },
  camera: { width: '100%', aspectRatio: 1, borderRadius: 16, overflow: 'hidden' },
  statusCard: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 20,
    padding: 18,
    gap: 12,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusText: { color: TEXT_PRIMARY, fontSize: 16, fontFamily: FONTS.heading },
  statusHint: { color: TEXT_SECONDARY, fontSize: 14, lineHeight: 20, fontFamily: FONTS.body },
  actions: { flexDirection: 'row', gap: 10 },
  primaryButton: {
    minWidth: 140,
    backgroundColor: BLUE,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: { color: WHITE, fontSize: 14, fontFamily: FONTS.body },
  secondaryButton: {
    minWidth: 120,
    backgroundColor: CARD_ALT,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: { color: TEXT_PRIMARY, fontSize: 14, fontFamily: FONTS.body },
});
