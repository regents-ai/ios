/**
 * AppearanceToggle - Light / Dark / System segmented control.
 *
 * Themed via useTheme. Writing the choice re-themes the whole app immediately
 * (the provider swaps tokens) and persists it. No entry animation — this is a
 * settings control the user taps deliberately; the selected pill uses a color
 * change, not motion.
 */

import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { RegentPressable } from '@/components/ui/RegentPressable';
import { useTheme, type AppearancePreference, type Theme } from '@/theme/ThemeProvider';

const OPTIONS: { value: AppearancePreference; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

export function AppearanceToggle() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { appearance, setAppearance } = theme;

  return (
    <View style={styles.card}>
      <Text style={styles.label}>APPEARANCE</Text>
      <View style={styles.track}>
        {OPTIONS.map((option) => {
          const selected = appearance === option.value;
          return (
            <RegentPressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={[styles.segment, selected && styles.segmentSelected]}
              onPress={() => setAppearance(option.value)}
            >
              <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>
                {option.label}
              </Text>
            </RegentPressable>
          );
        })}
      </View>
    </View>
  );
}

function makeStyles({ colors, fonts, type, space, radius }: Theme) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surfaceElevated,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.hairlineStrong,
      borderRadius: radius.lg,
      padding: space.s4,
      gap: space.s3,
    },
    // Uppercase micro-label, tracked, per the brand's printed-machine voice.
    label: {
      color: colors.textMuted,
      fontSize: type.caption.size,
      letterSpacing: 1.2,
      fontFamily: fonts.ui,
    },
    track: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.hairline,
      padding: 3,
      gap: 3,
    },
    segment: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: space.s2,
      borderRadius: radius.sm,
    },
    // Selected pill = accent wash + accent text (one accent per surface).
    segmentSelected: {
      backgroundColor: colors.accentWash,
    },
    segmentText: {
      color: colors.textMuted,
      fontSize: type.label.size,
      fontFamily: fonts.ui,
    },
    segmentTextSelected: {
      color: colors.accent,
    },
  });
}
