import { CoinbaseAlert } from '@/components/ui/CoinbaseAlerts';
import { RegentPressable } from '@/components/ui/RegentPressable';
import { getBaseUrl } from '@/constants/BASE_URL';
import { useCoinbaseAlert } from '@/hooks/useCoinbaseAlert';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import type { MobileAgent, MobileAgentKind, MobileAgentPairingCode } from '@/types/regents';
import { agentKindLabel, isAgentKind } from '@/utils/agents/kinds';
import { describeApiError } from '@/utils/apiError';
import { routes } from '@/utils/navigation/routes';
import { regentApi } from '@/utils/regentApi/client';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

function pairedIds(agents: MobileAgent[]) {
  return new Set(agents.filter((agent) => agent.paired).map((agent) => agent.id));
}

function expiryCopy(expiresAt: string, now: number) {
  const remainingMs = new Date(expiresAt).getTime() - now;
  if (remainingMs <= 0) {
    return 'This code has expired.';
  }
  const minutes = Math.ceil(remainingMs / 60000);
  return minutes === 1 ? 'Expires in about a minute.' : `Expires in ${minutes} minutes.`;
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
  const [creating, setCreating] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [copiedField, setCopiedField] = useState<'code' | 'instruction' | null>(null);
  const knownPairedIdsRef = useRef<Set<string> | null>(null);
  const pairedAgentRef = useRef<MobileAgent | null>(null);

  const createCode = useCallback(async () => {
    setCreating(true);
    try {
      // Snapshot before the code exists so the first agent paired with it is
      // the one that gets recognised, even if the list read races the pairing.
      knownPairedIdsRef.current = pairedIds(await regentApi.listAgents());
      setPairingCode(await regentApi.createAgentPairingCode({ name, kind }));
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

  useFocusEffect(
    useCallback(() => {
      if (!pairingCode) {
        return;
      }

      let active = true;
      const poll = async () => {
        const known = knownPairedIdsRef.current;
        if (!known || pairedAgentRef.current) {
          return;
        }
        const agents = await regentApi.listAgents().catch(() => null);
        if (!active || !agents) {
          return;
        }
        const justPaired = agents.find((agent) => agent.paired && !known.has(agent.id));
        if (justPaired) {
          pairedAgentRef.current = justPaired;
          router.replace(routes.agent(justPaired.id));
        }
      };

      void poll();
      const interval = setInterval(() => void poll(), POLL_INTERVAL_MS);
      return () => {
        active = false;
        clearInterval(interval);
      };
    }, [pairingCode, router])
  );

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

  const expired = pairingCode ? new Date(pairingCode.expiresAt).getTime() <= now : false;

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
        <View style={styles.card}>
          <Text style={styles.eyebrow}>{agentKindLabel(kind)}</Text>
          <Text style={styles.title}>{name}</Text>
          <Text style={styles.hint}>
            Give this code to your agent. Once it checks in, it appears in your list as paired.
          </Text>

          {creating || !pairingCode ? (
            <View style={styles.codeBlock}>
              {creating ? (
                <ActivityIndicator color={colors.accent} />
              ) : (
                <RegentPressable style={styles.primaryButton} onPress={createCode}>
                  <Text style={styles.primaryButtonText}>Try again</Text>
                </RegentPressable>
              )}
            </View>
          ) : (
            <>
              <View style={styles.codeBlock}>
                <Text selectable style={[styles.code, expired && styles.codeExpired]} accessibilityLabel={`Pairing code ${pairingCode.code}`}>
                  {pairingCode.code}
                </Text>
                <Text style={[styles.expiry, expired && styles.expiryExpired]}>{expiryCopy(pairingCode.expiresAt, now)}</Text>
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

        {pairingCode && !expired ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>What to send the agent</Text>
            <Text style={styles.hint}>Paste this into the chat or terminal of the agent. It has everything it needs.</Text>
            <Text selectable style={styles.instruction}>{pairingInstruction(pairingCode.code, pairingCode.expiresAt)}</Text>
          </View>
        ) : null}

        {pairingCode && !expired ? (
          <View style={styles.waitingRow}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={styles.waitingText}>Waiting for the agent to check in…</Text>
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
