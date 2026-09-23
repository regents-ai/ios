import { CoinbaseAlert } from '@/components/ui/CoinbaseAlerts';
import { RegentPressable } from '@/components/ui/RegentPressable';
import { getBaseUrl } from '@/constants/BASE_URL';
import { useCoinbaseAlert } from '@/hooks/useCoinbaseAlert';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import type { MobileAgentKind, MobileAgentPairingCode, MobileAgentPairingStatus } from '@/types/regents';
import { agentKindLabel, isAgentKind } from '@/utils/agents/kinds';
import { describeApiError } from '@/utils/apiError';
import { routes } from '@/utils/navigation/routes';
import { regentApi } from '@/utils/regentApi/client';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const AGENT_GUIDE_URL = 'https://raw.githubusercontent.com/regents-ai/elixir-utils/main/siwa/siwa-elixir/agent/README.md';
const NODE_CLIENT_URL = 'https://raw.githubusercontent.com/regents-ai/elixir-utils/main/siwa/siwa-elixir/agent/siwa-agent.mjs';
const PYTHON_CLIENT_URL = 'https://raw.githubusercontent.com/regents-ai/elixir-utils/main/siwa/siwa-elixir/agent/siwa_agent.py';
const SIWA_SERVER_URL = 'https://siwa-server.fly.dev';
const POLL_INTERVAL_MS = 3000;
const EXPIRED_MESSAGE = 'This code expired. Make a new one.';

function pairingInstruction(code: string, expiresAt: string) {
  const pairUrl = `${getBaseUrl()}/agent/pair`;
  return [
    'Pair with my Regents app.',
    '',
    `Guide: ${AGENT_GUIDE_URL}`,
    `Node client: ${NODE_CLIENT_URL}`,
    `Python client: ${PYTHON_CLIENT_URL}`,
    '',
    'Set these once in your shell:',
    'export SIWA_AUDIENCE=regents-mobile',
    `export SIWA_BROKER=${SIWA_SERVER_URL}`,
    '',
    'Run keygen, then sign-in, then send this exact request',
    '(Node shown; with Python use `uv run siwa_agent.py` and the same arguments):',
    `node siwa-agent.mjs request POST ${pairUrl} --body '{"code":"${code}"}'`,
    '',
    `The code works once and expires at ${new Date(expiresAt).toLocaleTimeString()}.`,
  ].join('\n');
}

function expiryCopy(expiresAt: string, now: number) {
  const remainingMs = new Date(expiresAt).getTime() - now;
  if (remainingMs <= 0) {
    return EXPIRED_MESSAGE;
  }
  const minutes = Math.ceil(remainingMs / 60000);
  return minutes === 1 ? 'Expires in about a minute.' : `Expires in ${minutes} minutes.`;
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export default function AgentPairingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ name?: string; kind?: string }>();
  const name = typeof params.name === 'string' ? params.name : '';
  const kind: MobileAgentKind = isAgentKind(params.kind) ? params.kind : 'other';
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { alertProps, showAlert } = useCoinbaseAlert();

  const [pairingCode, setPairingCode] = useState<MobileAgentPairingCode | null>(null);
  const [status, setStatus] = useState<MobileAgentPairingStatus>({ status: 'expired' });
  const [creating, setCreating] = useState(true);
  const [deciding, setDeciding] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [copiedField, setCopiedField] = useState<'code' | 'instruction' | null>(null);

  const createCode = useCallback(async () => {
    setCreating(true);
    try {
      const created = await regentApi.createAgentPairingCode({ name, kind });
      setPairingCode(created);
      setStatus({ status: 'waiting', expiresAt: created.expiresAt });
      setNow(Date.now());
    } catch (error) {
      showAlert({ title: 'Could not create a pairing code', message: describeApiError(error).message, type: 'error' });
    } finally {
      setCreating(false);
    }
  }, [kind, name, showAlert]);

  useEffect(() => {
    void createCode();
  }, [createCode]);

  useEffect(() => {
    const ticker = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(ticker);
  }, []);

  const expired = !pairingCode || status.status === 'expired' || new Date(pairingCode.expiresAt).getTime() <= now;

  // While the code is live and the screen is showing, ask the backend whether
  // an agent has signed in with it. Polling stops once the code expires.
  useFocusEffect(
    useCallback(() => {
      if (!pairingCode || expired || status.status === 'needs_confirmation') {
        return;
      }

      let active = true;
      const poll = async () => {
        const next = await regentApi.getAgentPairingStatus(pairingCode.code).catch(() => null);
        if (active && next) {
          setStatus(next);
        }
      };

      void poll();
      const interval = setInterval(() => void poll(), POLL_INTERVAL_MS);
      return () => {
        active = false;
        clearInterval(interval);
      };
    }, [expired, pairingCode, status.status])
  );

  const confirm = useCallback(async () => {
    if (!pairingCode) {
      return;
    }
    setDeciding(true);
    try {
      const agent = await regentApi.confirmAgentPairing(pairingCode.code);
      router.replace(routes.agent(agent.id));
    } catch (error) {
      showAlert({ title: 'Could not confirm this agent', message: describeApiError(error).message, type: 'error' });
      setDeciding(false);
    }
  }, [pairingCode, router, showAlert]);

  const notMine = useCallback(async () => {
    if (!pairingCode) {
      return;
    }
    setDeciding(true);
    try {
      await regentApi.discardAgentPairingCode(pairingCode.code);
      setPairingCode(null);
      setStatus({ status: 'expired' });
    } catch (error) {
      showAlert({ title: 'Could not discard this code', message: describeApiError(error).message, type: 'error' });
    } finally {
      setDeciding(false);
    }
  }, [pairingCode, showAlert]);

  const copy = useCallback(async (field: 'code' | 'instruction') => {
    if (!pairingCode) {
      return;
    }
    await Clipboard.setStringAsync(
      field === 'code' ? pairingCode.code : pairingInstruction(pairingCode.code, pairingCode.expiresAt)
    );
    setCopiedField(field);
    setTimeout(() => setCopiedField((current) => (current === field ? null : current)), 2000);
  }, [pairingCode]);

  const awaitingDecision = pairingCode && !expired && status.status === 'needs_confirmation' ? status : null;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <RegentPressable
          accessibilityLabel="Go back"
          accessibilityRole="button"
          pressStyle="icon"
          onPress={() => router.back()}
          style={styles.iconButton}
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </RegentPressable>
        <Text style={styles.headerTitle}>Pairing code</Text>
        <View style={styles.iconButtonSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {awaitingDecision ? (
          <View style={styles.card}>
            <Text style={styles.eyebrow}>{agentKindLabel(kind)}</Text>
            <Text style={styles.title}>{name}</Text>
            <View style={styles.confirmBlock}>
              <Ionicons name="finger-print-outline" size={28} color={colors.accent} />
              <Text style={styles.confirmTitle}>An agent signed in with address {shortAddress(awaitingDecision.walletAddress)}.</Text>
              <Text selectable style={styles.confirmAddress}>{awaitingDecision.walletAddress}</Text>
              <Text style={styles.confirmQuestion}>Is this your agent?</Text>
            </View>
            <View style={styles.actions}>
              <RegentPressable style={styles.primaryButton} onPress={confirm} disabled={deciding}>
                {deciding ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.primaryButtonText}>Confirm</Text>}
              </RegentPressable>
              <RegentPressable style={styles.secondaryButton} onPress={notMine} disabled={deciding}>
                <Text style={styles.secondaryButtonText}>Not mine</Text>
              </RegentPressable>
            </View>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.eyebrow}>{agentKindLabel(kind)}</Text>
            <Text style={styles.title}>{name}</Text>
            <Text style={styles.hint}>
              Give this code to your agent. Once it signs in, you confirm the address it used and it appears in your list as paired.
            </Text>

            {creating || !pairingCode ? (
              <View style={styles.codeBlock}>
                {creating ? (
                  <ActivityIndicator color={colors.accent} />
                ) : (
                  <>
                    <Text style={styles.expiry}>No code right now.</Text>
                    <RegentPressable style={styles.primaryButton} onPress={createCode}>
                      <Text style={styles.primaryButtonText}>New code</Text>
                    </RegentPressable>
                  </>
                )}
              </View>
            ) : (
              <>
                <View style={styles.codeBlock}>
                  <Text selectable style={[styles.code, expired && styles.codeExpired]} accessibilityLabel={`Pairing code ${pairingCode.code}`}>
                    {pairingCode.code}
                  </Text>
                  <Text style={[styles.expiry, expired && styles.expiryExpired]}>
                    {expired ? EXPIRED_MESSAGE : expiryCopy(pairingCode.expiresAt, now)}
                  </Text>
                </View>
                <View style={styles.actions}>
                  {expired ? (
                    <RegentPressable style={styles.primaryButton} onPress={createCode}>
                      <Text style={styles.primaryButtonText}>New code</Text>
                    </RegentPressable>
                  ) : (
                    <>
                      <RegentPressable style={styles.primaryButton} onPress={() => copy('instruction')}>
                        <Text style={styles.primaryButtonText}>
                          {copiedField === 'instruction' ? 'Copied' : 'Copy instructions for the agent'}
                        </Text>
                      </RegentPressable>
                      <RegentPressable style={styles.secondaryButton} onPress={() => copy('code')}>
                        <Text style={styles.secondaryButtonText}>{copiedField === 'code' ? 'Copied' : 'Copy code only'}</Text>
                      </RegentPressable>
                    </>
                  )}
                </View>
              </>
            )}
          </View>
        )}

        {pairingCode && !expired && !awaitingDecision ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>What to send the agent</Text>
            <Text style={styles.hint}>Paste this into the chat or terminal of the agent. It has everything it needs.</Text>
            <Text selectable style={styles.instruction}>{pairingInstruction(pairingCode.code, pairingCode.expiresAt)}</Text>
          </View>
        ) : null}

        {pairingCode && !expired && !awaitingDecision ? (
          <View style={styles.waitingRow}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={styles.waitingText}>Waiting for the agent to sign in…</Text>
          </View>
        ) : null}
      </ScrollView>

      <CoinbaseAlert {...alertProps} />
    </SafeAreaView>
  );
}

function makeStyles({ colors, fonts }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 8,
    },
    iconButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.hairlineStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconButtonSpacer: {
      width: 44,
      height: 44,
    },
    headerTitle: {
      flex: 1,
      color: colors.text,
      fontSize: 20,
      lineHeight: 24,
      textAlign: 'center',
      fontFamily: fonts.title,
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingBottom: 40,
      gap: 16,
    },
    card: {
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.hairlineStrong,
      borderRadius: 24,
      padding: 20,
      gap: 12,
    },
    eyebrow: {
      color: colors.accent,
      fontSize: 12,
      letterSpacing: 1,
      textTransform: 'uppercase',
      fontFamily: fonts.ui,
    },
    title: {
      color: colors.text,
      fontSize: 28,
      fontFamily: fonts.title,
    },
    hint: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 19,
      fontFamily: fonts.ui,
    },
    codeBlock: {
      backgroundColor: colors.surface,
      borderRadius: 18,
      paddingVertical: 22,
      paddingHorizontal: 16,
      alignItems: 'center',
      gap: 6,
      minHeight: 96,
      justifyContent: 'center',
    },
    code: {
      color: colors.text,
      fontSize: 36,
      letterSpacing: 4,
      fontFamily: fonts.title,
    },
    codeExpired: {
      color: colors.textMuted,
      textDecorationLine: 'line-through',
    },
    expiry: {
      color: colors.textMuted,
      fontSize: 13,
      fontFamily: fonts.ui,
    },
    expiryExpired: {
      color: colors.error,
    },
    confirmBlock: {
      backgroundColor: colors.surface,
      borderRadius: 18,
      paddingVertical: 22,
      paddingHorizontal: 16,
      alignItems: 'center',
      gap: 8,
    },
    confirmTitle: {
      color: colors.text,
      fontSize: 17,
      lineHeight: 23,
      textAlign: 'center',
      fontFamily: fonts.title,
    },
    confirmAddress: {
      color: colors.textMuted,
      fontSize: 12,
      textAlign: 'center',
      fontFamily: fonts.ui,
    },
    confirmQuestion: {
      color: colors.text,
      fontSize: 15,
      textAlign: 'center',
      fontFamily: fonts.ui,
    },
    actions: {
      gap: 10,
    },
    primaryButton: {
      backgroundColor: colors.accent,
      borderRadius: 16,
      paddingHorizontal: 18,
      paddingVertical: 13,
      alignItems: 'center',
    },
    primaryButtonText: {
      color: colors.onAccent,
      fontSize: 14,
      fontFamily: fonts.ui,
    },
    secondaryButton: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      paddingHorizontal: 18,
      paddingVertical: 13,
      borderWidth: 1,
      borderColor: colors.hairlineStrong,
      alignItems: 'center',
    },
    secondaryButtonText: {
      color: colors.text,
      fontSize: 14,
      fontFamily: fonts.ui,
    },
    sectionTitle: {
      color: colors.text,
      fontSize: 22,
      fontFamily: fonts.title,
    },
    instruction: {
      backgroundColor: colors.surface,
      borderRadius: 18,
      padding: 14,
      color: colors.text,
      fontSize: 12,
      lineHeight: 18,
      fontFamily: fonts.ui,
    },
    waitingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      paddingVertical: 8,
    },
    waitingText: {
      color: colors.textMuted,
      fontSize: 13,
      fontFamily: fonts.ui,
    },
  });
}
