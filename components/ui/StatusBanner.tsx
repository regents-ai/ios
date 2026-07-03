/**
 * Inline progressive status banner.
 *
 * Replaces blocking spinner overlays and popup alerts on form screens with a
 * quiet inline trio under the form:
 * - working: spinner + progress message
 * - success: checkmark + confirmation message
 * - error:   triangle + actionable message
 */

import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useTheme, type Theme } from '@/theme/ThemeProvider';

export type StatusBannerState = 'working' | 'success' | 'error';

export function StatusBanner({ state, message }: { state: StatusBannerState; message: string }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { colors } = theme;
  return (
    <View
      style={[styles.banner, styles[state]]}
      accessibilityRole={state === 'error' ? 'alert' : undefined}
      accessibilityLiveRegion="polite"
    >
      {state === 'working' ? (
        <ActivityIndicator size="small" color={colors.accent} />
      ) : state === 'success' ? (
        <Ionicons name="checkmark-circle" size={18} color={colors.success} />
      ) : (
        <Ionicons name="warning-outline" size={18} color={colors.error} />
      )}
      <Text style={styles.message} selectable={state === 'error'}>
        {message}
      </Text>
    </View>
  );
}

function makeStyles({ colors, fonts, type }: Theme) {
  return StyleSheet.create({
    banner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    working: {
      backgroundColor: colors.accentWash,
      borderColor: colors.hairlineStrong,
    },
    success: {
      backgroundColor: colors.successWash,
      borderColor: colors.success,
    },
    error: {
      backgroundColor: colors.errorWash,
      borderColor: colors.error,
    },
    message: {
      flex: 1,
      minWidth: 0,
      color: colors.text,
      fontSize: type.label.size,
      lineHeight: type.body.line,
      fontFamily: fonts.ui,
    },
  });
}
