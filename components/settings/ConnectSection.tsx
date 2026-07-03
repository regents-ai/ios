/**
 * Connect section (Settings): the returning-user selector for the three
 * onboarding paths — connect an existing Hermes agent, create a cloud agent,
 * and onramp USDC. Mirrors the first-open welcome sheet (app/onboarding).
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { RegentPressable } from '@/components/ui/RegentPressable';
import { useTheme, type Theme } from '@/theme/ThemeProvider';

export function ConnectSection() {
  const router = useRouter();
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const rows: {
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    detail: string;
    onPress: () => void;
  }[] = [
    {
      icon: 'terminal-outline',
      title: 'Existing Hermes Agent',
      detail: 'Link the agent already running on your computer',
      onPress: () => router.push('/onboarding/connect-hermes'),
    },
    {
      icon: 'cloud-outline',
      title: 'Create Agent in Regents Cloud',
      detail: 'Set up a new agent, hosted for you',
      onPress: () => router.push('/onboarding/create-cloud-agent'),
    },
    {
      icon: 'cash-outline',
      title: 'Onramp USDC to an agent',
      detail: 'Load funds with Apple Pay or your card',
      onPress: () => router.push('/(tabs)/wallet'),
    },
  ];

  return (
    <View style={styles.card}>
      {rows.map((row, index) => (
        <View key={row.title}>
          <RegentPressable haptic="selection" pressStyle="card" style={styles.row} onPress={row.onPress}>
            <View style={styles.icon}>
              <Ionicons name={row.icon} size={22} color={colors.accent} />
            </View>
            <View style={styles.copy}>
              <Text style={styles.title}>{row.title}</Text>
              <Text style={styles.detail}>{row.detail}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </RegentPressable>
          {index < rows.length - 1 ? <View style={styles.divider} /> : null}
        </View>
      ))}
    </View>
  );
}

function makeStyles({ colors, fonts }: Theme) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: 28,
      borderWidth: 1,
      borderColor: colors.hairlineStrong,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingHorizontal: 20,
      paddingVertical: 18,
    },
    icon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.bg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    copy: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    title: {
      color: colors.text,
      fontSize: 18,
      fontFamily: fonts.title,
    },
    detail: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 18,
      fontFamily: fonts.ui,
    },
    divider: {
      height: 1,
      backgroundColor: colors.hairlineStrong,
      marginLeft: 78,
    },
  });
}
