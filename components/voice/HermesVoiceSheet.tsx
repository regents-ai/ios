import { RegentPressable } from '@/components/ui/RegentPressable';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { useHermesVoiceSession } from '@/hooks/useHermesVoiceSession';
import { routes } from '@/utils/navigation/routes';
import { gatewayDisplayLabel } from '@/utils/voice/localGateway';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type HermesVoiceSheetProps = {
  agentId: string;
  agentName: string;
  visible: boolean;
  onClose: () => void;
};

function statusCopy(value: string) {
  switch (value) {
    case 'checking':
      return 'Checking voice...';
    case 'connecting':
      return 'Starting voice...';
    case 'connected':
      return 'Listening';
    case 'error':
      return 'Voice needs attention';
    default:
      return 'Ready';
  }
}

export function HermesVoiceSheet({ agentId, agentName, visible, onClose }: HermesVoiceSheetProps) {
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const router = useRouter();
  const voice = useHermesVoiceSession(agentId, agentName);
  const refreshStatus = voice.refreshStatus;
  const prewarm = voice.prewarm;
  const usingLocal = voice.localGateway !== null;
  // A paired local gateway holds its own OpenAI key, so the hosted ChatGPT gate
  // does not apply when local.
  const needsAccount = !usingLocal && voice.status?.account.satisfied === false;
  const connected = voice.connectionState === 'connected';
  const busy = voice.connectionState === 'checking' || voice.connectionState === 'connecting';

  const openLocalPairing = () => {
    void voice.disconnect();
    router.push(routes.localVoicePairing());
  };

  const refreshLocalGateway = voice.refreshLocalGateway;
  useEffect(() => {
    if (!visible) {
      return;
    }

    let mounted = true;
    void refreshLocalGateway();
    refreshStatus().then((nextStatus) => {
      if (mounted) {
        void prewarm(nextStatus);
      }
    });

    return () => {
      mounted = false;
    };
  }, [visible, refreshStatus, prewarm, refreshLocalGateway]);

  const close = () => {
    void voice.disconnect();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>Voice</Text>
            <Text style={styles.title}>{agentName}</Text>
          </View>
          <RegentPressable pressStyle="icon" onPress={close} style={styles.iconButton}>
            <Ionicons name="close" size={22} color={colors.text} />
          </RegentPressable>
        </View>

        <View style={styles.statusPanel}>
          <View style={[styles.micCircle, connected && styles.micCircleActive]}>
            {busy ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <Ionicons name={connected ? 'mic' : 'mic-outline'} size={34} color={colors.onAccent} />
            )}
          </View>
          <Text style={styles.statusTitle}>{needsAccount ? 'Connect ChatGPT' : statusCopy(voice.connectionState)}</Text>
          <Text style={styles.statusBody}>
            {needsAccount
              ? 'Connect ChatGPT once, then come back to talk to Hermes.'
              : connected
                ? 'Speak naturally. Hermes will ask before any sensitive action.'
                : 'Start voice when you are ready.'}
          </Text>
          {voice.errorMessage ? <Text style={styles.errorText}>{voice.errorMessage}</Text> : null}
          <Text style={styles.sourceLabel}>
            {usingLocal
              ? `Using local Hermes (${gatewayDisplayLabel(voice.localGateway!)})`
              : 'Using hosted Hermes'}
          </Text>
        </View>

        {voice.approvalRequest ? (
          <View style={styles.approvalPanel}>
            <Text style={styles.approvalTitle}>{voice.approvalRequest.title}</Text>
            <Text style={styles.approvalBody}>{voice.approvalRequest.body}</Text>
            <View style={styles.approvalActions}>
              <RegentPressable style={styles.secondaryButton} onPress={() => voice.resolveApproval(false)}>
                <Text style={styles.secondaryButtonText}>Deny</Text>
              </RegentPressable>
              <RegentPressable style={styles.primaryButton} onPress={() => voice.resolveApproval(true)}>
                <Text style={styles.primaryButtonText}>{voice.approvalRequest.actionLabel}</Text>
              </RegentPressable>
            </View>
          </View>
        ) : null}

        <View style={styles.footer}>
          {needsAccount ? (
            <RegentPressable style={styles.primaryButton} onPress={voice.openAccountConnection}>
              <Text style={styles.primaryButtonText}>Connect ChatGPT</Text>
            </RegentPressable>
          ) : connected ? (
            <RegentPressable style={styles.secondaryButton} onPress={voice.disconnect}>
              <Text style={styles.secondaryButtonText}>End voice</Text>
            </RegentPressable>
          ) : (
            <RegentPressable style={styles.primaryButton} onPress={voice.start} disabled={busy}>
              <Text style={styles.primaryButtonText}>{busy ? 'Starting...' : 'Start voice'}</Text>
            </RegentPressable>
          )}
        </View>

        {!connected && !busy ? (
          <RegentPressable style={styles.localLink} onPress={openLocalPairing}>
            <Ionicons name="qr-code-outline" size={16} color={colors.accent} />
            <Text style={styles.localLinkText}>
              {usingLocal ? 'Manage local Hermes' : 'Connect to local Hermes'}
            </Text>
          </RegentPressable>
        ) : null}
      </View>
    </Modal>
  );
}

function makeStyles({ colors, fonts }: Theme) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: 20,
    gap: 18,
  },
  header: {
    paddingTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eyebrow: {
    fontFamily: fonts.ui,
    color: colors.textMuted,
    fontSize: 12,
  },
  title: {
    marginTop: 4,
    fontFamily: fonts.title,
    color: colors.text,
    fontSize: 24,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
  },
  statusPanel: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  micCircle: {
    width: 104,
    height: 104,
    borderRadius: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  micCircleActive: {
    backgroundColor: colors.success,
  },
  statusTitle: {
    fontFamily: fonts.title,
    color: colors.text,
    fontSize: 25,
    textAlign: 'center',
  },
  statusBody: {
    maxWidth: 310,
    fontFamily: fonts.ui,
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  errorText: {
    maxWidth: 320,
    fontFamily: fonts.ui,
    color: colors.error,
    fontSize: 14,
    textAlign: 'center',
  },
  sourceLabel: {
    fontFamily: fonts.ui,
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
  },
  localLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  localLinkText: {
    fontFamily: fonts.ui,
    color: colors.accent,
    fontSize: 14,
  },
  approvalPanel: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    backgroundColor: colors.surfaceElevated,
    padding: 16,
    gap: 10,
  },
  approvalTitle: {
    fontFamily: fonts.title,
    fontSize: 18,
    color: colors.text,
  },
  approvalBody: {
    fontFamily: fonts.ui,
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
  },
  approvalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  footer: {
    paddingBottom: 18,
  },
  primaryButton: {
    minHeight: 50,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  primaryButtonText: {
    fontFamily: fonts.title,
    color: colors.onAccent,
    fontSize: 16,
  },
  secondaryButton: {
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    flex: 1,
  },
  secondaryButtonText: {
    fontFamily: fonts.title,
    color: colors.text,
    fontSize: 16,
  },
  });
}
