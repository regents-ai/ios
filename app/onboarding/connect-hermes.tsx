/**
 * Path 1: connect an existing Hermes agent.
 *
 * Shows the Regents plugin install command, then a QR scanner (same
 * expo-camera pattern as app/settings/local-voice.tsx) for the code the
 * plugin displays on the computer. A scanned code is read with
 * `parseAgentLinkQr`, then submitted to the backend, which connects the
 * agent to this account. On success the person lands on their agents list.
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { CoinbaseAlert } from '@/components/ui/CoinbaseAlerts';
import { RegentPressable } from '@/components/ui/RegentPressable';
import { useCoinbaseAlert } from '@/hooks/useCoinbaseAlert';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { outcomeForClaimError, outcomeForScan, type ConnectPhase } from '@/utils/agentLink/connectFlow';
import { regentApi } from '@/utils/regentApi/client';

/** Install command shown to the user. TODO(sean-decision): confirm final command. */
const PLUGIN_INSTALL_COMMAND = 'hermes plugins install regents';

export default function ConnectHermesScreen() {
  const router = useRouter();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { colors } = theme;
  const { alertProps, showAlert } = useCoinbaseAlert();
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<ConnectPhase>('idle');
  const [connectedName, setConnectedName] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const handledRef = useRef(false);

  const scanning = phase === 'scanning';

  const copyCommand = useCallback(async () => {
    await Clipboard.setStringAsync(PLUGIN_INSTALL_COMMAND);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  const beginScan = useCallback(async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        showAlert({
          title: 'Camera access needed',
          message: 'Allow camera access to scan the code your agent shows on your computer.',
          type: 'info',
        });
        return;
      }
    }
    handledRef.current = false;
    setPhase('scanning');
  }, [permission, requestPermission, showAlert]);

  const onScanned = useCallback(
    async ({ data }: { data: string }) => {
      if (handledRef.current || !data) {
        return;
      }
      handledRef.current = true;

      const outcome = outcomeForScan(data);
      if (outcome.kind === 'reject') {
        setPhase(outcome.phase);
        showAlert({ title: outcome.alert.title, message: outcome.alert.message, type: 'error' });
        return;
      }

      setPhase(outcome.phase);
      try {
        const agent = await regentApi.claimAgentLink({ code: outcome.code });
        setConnectedName(agent.name);
        setPhase('connected');
      } catch (error) {
        const failure = outcomeForClaimError(error);
        setPhase(failure.phase);
        showAlert({ title: failure.alert.title, message: failure.alert.message, type: 'error' });
      }
    },
    [showAlert],
  );

  const goToAgents = useCallback(() => {
    router.replace('/agents');
  }, [router]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <RegentPressable pressStyle="icon" onPress={() => router.back()} style={styles.iconButton}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </RegentPressable>
        <Text style={styles.headerTitle}>Connect your agent</Text>
        <View style={styles.iconButton} />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>
          Already running a Hermes agent on your computer? Install the Regents plugin there, then
          scan the code it shows to link that agent to this phone.
        </Text>

        <View style={styles.stepCard}>
          <Text style={styles.stepLabel}>Step 1</Text>
          <Text style={styles.stepTitle}>Install the Regents plugin</Text>
          <Text style={styles.stepHint}>Run this on the computer where your agent lives.</Text>
          <View style={styles.commandRow}>
            <Text style={styles.commandText}>{PLUGIN_INSTALL_COMMAND}</Text>
            <RegentPressable pressStyle="icon" style={styles.copyButton} onPress={() => void copyCommand()}>
              <Ionicons
                name={copied ? 'checkmark' : 'copy-outline'}
                size={18}
                color={copied ? colors.success : colors.text}
              />
            </RegentPressable>
          </View>
          <Text style={styles.stepHint}>
            The first run shows a QR code. You can bring it back any time with `hermes regents qr`.
          </Text>
        </View>

        {phase === 'connected' ? (
          <View style={styles.stepCard}>
            <View style={styles.connectedIcon}>
              <Ionicons name="checkmark-circle" size={28} color={colors.success} />
            </View>
            <Text style={styles.stepTitle}>
              {connectedName ? `${connectedName} is connected` : 'Your agent is connected'}
            </Text>
            <Text style={styles.stepHint}>
              You can reach it any time from your agents list.
            </Text>
            <RegentPressable style={styles.primaryButton} onPress={goToAgents}>
              <View style={styles.primaryButtonContent}>
                <Text style={styles.primaryButtonText}>Go to my agents</Text>
                <Ionicons name="arrow-forward" size={18} color={colors.onAccent} />
              </View>
            </RegentPressable>
          </View>
        ) : (
          <View style={styles.stepCard}>
            <Text style={styles.stepLabel}>Step 2</Text>
            <Text style={styles.stepTitle}>Scan the code</Text>
            {scanning ? (
              <>
                <CameraView
                  style={styles.camera}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                  onBarcodeScanned={({ data }) => void onScanned({ data })}
                />
                <RegentPressable style={styles.secondaryButton} onPress={() => setPhase('idle')}>
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </RegentPressable>
              </>
            ) : phase === 'submitting' ? (
              <View style={styles.submittingRow}>
                <ActivityIndicator color={colors.accent} size="small" />
                <Text style={styles.stepHint}>Connecting your agent…</Text>
              </View>
            ) : (
              <RegentPressable style={styles.primaryButton} onPress={() => void beginScan()}>
                {permission === null ? (
                  <ActivityIndicator color={colors.onAccent} size="small" />
                ) : (
                  <View style={styles.primaryButtonContent}>
                    <Ionicons name="qr-code-outline" size={18} color={colors.onAccent} />
                    <Text style={styles.primaryButtonText}>Connect Agent with QR</Text>
                  </View>
                )}
              </RegentPressable>
            )}
          </View>
        )}
      </ScrollView>

      <CoinbaseAlert {...alertProps} />
    </SafeAreaView>
  );
}

function makeStyles({ colors, fonts, type, space, radius }: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: space.s5,
      paddingTop: space.s3,
      paddingBottom: space.s2,
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
    headerTitle: { color: colors.text, fontSize: type.headline.size, fontFamily: fonts.title },
    body: { paddingHorizontal: space.s5, paddingVertical: space.s4, gap: space.s4 },
    intro: {
      color: colors.textMuted,
      fontSize: type.label.size,
      lineHeight: type.label.line,
      fontFamily: fonts.ui,
    },
    stepCard: {
      backgroundColor: colors.surfaceElevated,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.hairlineStrong,
      borderRadius: radius.lg,
      padding: space.s4,
      gap: space.s3,
    },
    stepLabel: {
      color: colors.accent,
      fontSize: type.caption.size,
      fontFamily: fonts.ui,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    stepTitle: { color: colors.text, fontSize: type.headline.size, fontFamily: fonts.title },
    stepHint: {
      color: colors.textMuted,
      fontSize: type.label.size,
      lineHeight: type.label.line,
      fontFamily: fonts.ui,
    },
    commandRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.s2,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.hairlineStrong,
      borderRadius: radius.md,
      paddingLeft: space.s3,
      paddingRight: space.s1,
      paddingVertical: space.s2,
    },
    commandText: {
      flex: 1,
      color: colors.text,
      fontSize: type.code.size,
      lineHeight: type.code.line,
      fontFamily: fonts.ui,
    },
    copyButton: {
      width: 36,
      height: 36,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    camera: { width: '100%', aspectRatio: 1, borderRadius: radius.md, overflow: 'hidden' },
    connectedIcon: { alignItems: 'flex-start' },
    submittingRow: { flexDirection: 'row', alignItems: 'center', gap: space.s2, paddingVertical: space.s2 },
    primaryButton: {
      backgroundColor: colors.accent,
      borderRadius: radius.md,
      paddingHorizontal: space.s4,
      paddingVertical: space.s3,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryButtonContent: { flexDirection: 'row', alignItems: 'center', gap: space.s2 },
    primaryButtonText: { color: colors.onAccent, fontSize: type.label.size, fontFamily: fonts.ui },
    secondaryButton: {
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
