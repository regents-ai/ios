import { CoinbaseAlert } from '@/components/ui/CoinbaseAlerts';
import { RegentPressable } from '@/components/ui/RegentPressable';
import { useCoinbaseAlert } from '@/hooks/useCoinbaseAlert';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import type { MobileAgentKind } from '@/types/regents';
import { AGENT_KIND_OPTIONS } from '@/utils/agents/kinds';
import { describeApiError } from '@/utils/apiError';
import { routes } from '@/utils/navigation/routes';
import { regentApi } from '@/utils/regentApi/client';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

const WALLET_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

export default function AddAgentScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { alertProps, showAlert } = useCoinbaseAlert();

  const [name, setName] = useState('');
  const [kind, setKind] = useState<MobileAgentKind>('hermes');
  const [walletAddress, setWalletAddress] = useState('');
  const [adding, setAdding] = useState(false);

  const trimmedName = name.trim();
  const trimmedAddress = walletAddress.trim();
  const addressLooksValid = WALLET_ADDRESS_PATTERN.test(trimmedAddress);
  const addressError = trimmedAddress.length > 0 && !addressLooksValid;

  const requireName = useCallback(() => {
    if (trimmedName) {
      return true;
    }
    showAlert({ title: 'Name needed', message: 'Give this agent a name so you can tell it apart later.', type: 'error' });
    return false;
  }, [showAlert, trimmedName]);

  const openPairing = useCallback(() => {
    if (!requireName()) {
      return;
    }
    router.push(routes.agentPairing({ name: trimmedName, kind }));
  }, [kind, requireName, router, trimmedName]);

  const pasteAddress = useCallback(async () => {
    const text = (await Clipboard.getStringAsync().catch(() => '')).trim();
    if (text) {
      setWalletAddress(text);
    }
  }, []);

  const addByAddress = useCallback(async () => {
    if (!requireName()) {
      return;
    }
    if (!addressLooksValid) {
      showAlert({
        title: 'Check the wallet address',
        message: 'Paste the agent\'s Base wallet address. It starts with 0x and is 42 characters long.',
        type: 'error',
      });
      return;
    }

    setAdding(true);
    try {
      const agent = await regentApi.addAgent({ name: trimmedName, kind, walletAddress: trimmedAddress });
      router.replace(routes.agent(agent.id));
    } catch (error) {
      showAlert({ title: 'Could not add this agent', message: describeApiError(error).message, type: 'error' });
    } finally {
      setAdding(false);
    }
  }, [addressLooksValid, kind, requireName, router, showAlert, trimmedAddress, trimmedName]);

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
        <Text style={styles.headerTitle}>Add agent</Text>
        <View style={styles.iconButtonSpacer} />
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              maxLength={60}
              placeholder="What do you call this agent?"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              accessibilityLabel="Agent name"
              returnKeyType="done"
            />

            <Text style={styles.label}>Kind</Text>
            <View style={styles.kindRow}>
              {AGENT_KIND_OPTIONS.map((option) => {
                const selected = option.kind === kind;
                return (
                  <RegentPressable
                    key={option.kind}
                    haptic="selection"
                    pressStyle="chip"
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setKind(option.kind)}
                    style={[styles.kindChip, selected && styles.kindChipSelected]}
                  >
                    <Text style={[styles.kindChipText, selected && styles.kindChipTextSelected]}>{option.label}</Text>
                  </RegentPressable>
                );
              })}
            </View>
          </View>

          <View style={[styles.card, styles.pairCard]}>
            <Text style={styles.sectionTitle}>Give it a pairing code</Text>
            <Text style={styles.sectionHint}>
              Best for agents that can run commands. The agent proves it owns its wallet, and it shows up here as paired.
            </Text>
            <RegentPressable style={styles.primaryButton} onPress={openPairing}>
              <Text style={styles.primaryButtonText}>Get a pairing code</Text>
            </RegentPressable>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Paste its wallet address</Text>
            <Text style={styles.sectionHint}>Works for any agent with a Base wallet. You can pair it later.</Text>
            <View style={styles.addressRow}>
              <TextInput
                value={walletAddress}
                onChangeText={setWalletAddress}
                placeholder="0x…"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, styles.addressInput, addressError && styles.inputError]}
                accessibilityLabel="Agent wallet address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
              />
              <RegentPressable style={styles.pasteButton} onPress={pasteAddress} accessibilityLabel="Paste wallet address">
                <Ionicons name="clipboard-outline" size={20} color={colors.accent} />
              </RegentPressable>
            </View>
            {addressError ? <Text style={styles.errorText}>That does not look like a Base wallet address.</Text> : null}
            <RegentPressable
              style={[styles.secondaryButton, adding && styles.buttonBusy]}
              onPress={addByAddress}
              disabled={adding}
              accessibilityState={{ disabled: adding }}
            >
              <Text style={styles.secondaryButtonText}>{adding ? 'Adding…' : 'Add agent'}</Text>
            </RegentPressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

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
    flex: {
      flex: 1,
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
    pairCard: {
      backgroundColor: colors.accentWash,
      borderColor: colors.accentWash,
    },
    label: {
      color: colors.textMuted,
      fontSize: 12,
      textTransform: 'uppercase',
      letterSpacing: 1,
      fontFamily: fonts.ui,
    },
    input: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.hairlineStrong,
      borderRadius: 18,
      padding: 16,
      fontSize: 16,
      color: colors.text,
      fontFamily: fonts.ui,
    },
    inputError: {
      borderColor: colors.error,
    },
    errorText: {
      color: colors.error,
      fontSize: 13,
      fontFamily: fonts.ui,
    },
    kindRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    kindChip: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.hairlineStrong,
      backgroundColor: colors.surface,
      paddingHorizontal: 14,
      paddingVertical: 9,
    },
    kindChipSelected: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    kindChipText: {
      color: colors.text,
      fontSize: 14,
      fontFamily: fonts.ui,
    },
    kindChipTextSelected: {
      color: colors.onAccent,
    },
    sectionTitle: {
      color: colors.text,
      fontSize: 22,
      fontFamily: fonts.title,
    },
    sectionHint: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 19,
      fontFamily: fonts.ui,
    },
    addressRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    addressInput: {
      flex: 1,
      minWidth: 0,
    },
    pasteButton: {
      width: 52,
      height: 52,
      borderRadius: 18,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.hairlineStrong,
      alignItems: 'center',
      justifyContent: 'center',
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
    buttonBusy: {
      opacity: 0.7,
    },
  });
}
