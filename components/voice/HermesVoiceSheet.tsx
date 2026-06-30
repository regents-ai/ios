import { RegentPressable } from '@/components/ui/RegentPressable';
import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import { useHermesVoiceSession } from '@/hooks/useHermesVoiceSession';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect } from 'react';
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
  const voice = useHermesVoiceSession(agentId, agentName);
  const refreshStatus = voice.refreshStatus;
  const prewarm = voice.prewarm;
  const needsAccount = voice.status?.account.satisfied === false;
  const connected = voice.connectionState === 'connected';
  const busy = voice.connectionState === 'checking' || voice.connectionState === 'connecting';

  useEffect(() => {
    if (!visible) {
      return;
    }

    let mounted = true;
    refreshStatus().then((nextStatus) => {
      if (mounted) {
        void prewarm(nextStatus);
      }
    });

    return () => {
      mounted = false;
    };
  }, [visible, refreshStatus, prewarm]);

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
            <Ionicons name="close" size={22} color={COLORS.TEXT_PRIMARY} />
          </RegentPressable>
        </View>

        <View style={styles.statusPanel}>
          <View style={[styles.micCircle, connected && styles.micCircleActive]}>
            {busy ? (
              <ActivityIndicator color={COLORS.textOnColor} />
            ) : (
              <Ionicons name={connected ? 'mic' : 'mic-outline'} size={34} color={COLORS.textOnColor} />
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
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.DARK_BG,
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
    fontFamily: FONTS.body,
    color: COLORS.TEXT_SECONDARY,
    fontSize: 12,
  },
  title: {
    marginTop: 4,
    fontFamily: FONTS.heading,
    color: COLORS.TEXT_PRIMARY,
    fontSize: 24,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.CARD_BG,
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
    backgroundColor: COLORS.BLUE,
  },
  micCircleActive: {
    backgroundColor: COLORS.SUCCESS,
  },
  statusTitle: {
    fontFamily: FONTS.heading,
    color: COLORS.TEXT_PRIMARY,
    fontSize: 25,
    textAlign: 'center',
  },
  statusBody: {
    maxWidth: 310,
    fontFamily: FONTS.body,
    color: COLORS.TEXT_SECONDARY,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  errorText: {
    maxWidth: 320,
    fontFamily: FONTS.body,
    color: COLORS.DANGER,
    fontSize: 14,
    textAlign: 'center',
  },
  approvalPanel: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    backgroundColor: COLORS.CARD_BG,
    padding: 16,
    gap: 10,
  },
  approvalTitle: {
    fontFamily: FONTS.heading,
    fontSize: 18,
    color: COLORS.TEXT_PRIMARY,
  },
  approvalBody: {
    fontFamily: FONTS.body,
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
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
    backgroundColor: COLORS.BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  primaryButtonText: {
    fontFamily: FONTS.heading,
    color: COLORS.textOnColor,
    fontSize: 16,
  },
  secondaryButton: {
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    backgroundColor: COLORS.CARD_BG,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    flex: 1,
  },
  secondaryButtonText: {
    fontFamily: FONTS.heading,
    color: COLORS.TEXT_PRIMARY,
    fontSize: 16,
  },
});
