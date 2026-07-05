import { RegentPressable } from '@/components/ui/RegentPressable';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import type { MobileRegentVoice, RegentRuntimeKind } from '@/types/regents';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

type HermesVoiceButtonProps = {
  voice: MobileRegentVoice;
  runtimeKind: RegentRuntimeKind;
  onPress: () => void;
};

export function HermesVoiceButton({ voice, runtimeKind, onPress }: HermesVoiceButtonProps) {
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const isSelfHosted = runtimeKind === 'self_hosted';

  // A hosted agent hides the button when the hosted voice path is truly
  // unavailable. A self-run agent always offers the button — voice runs from
  // its own computer, so the hosted availability fold does not apply.
  if (!isSelfHosted && !voice.enabled && voice.health === 'unavailable' && voice.account.satisfied) {
    return null;
  }

  const needsAccount = !isSelfHosted && !voice.account.satisfied;
  const label = isSelfHosted ? 'Talk to this agent' : needsAccount ? 'Connect ChatGPT' : 'Talk to Hermes';
  const detail = isSelfHosted
    ? 'Talk to this agent on your computer.'
    : needsAccount
      ? 'Connect once to use voice.'
      : 'Start a live voice chat.';
  const iconName = isSelfHosted ? 'mic-outline' : needsAccount ? 'link-outline' : 'mic-outline';

  return (
    <RegentPressable
      accessibilityRole="button"
      style={[styles.button, needsAccount && styles.accountButton]}
      onPress={onPress}
    >
      <View style={styles.iconWrap}>
        <Ionicons name={iconName} size={18} color={colors.onAccent} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.detail}>{detail}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </RegentPressable>
  );
}

function makeStyles({ colors, fonts }: Theme) {
  return StyleSheet.create({
  button: {
    minHeight: 58,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  accountButton: {
    backgroundColor: colors.accentWash,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    fontFamily: fonts.title,
    fontSize: 15,
    color: colors.text,
  },
  detail: {
    marginTop: 2,
    fontFamily: fonts.ui,
    fontSize: 12,
    color: colors.textMuted,
  },
  });
}
