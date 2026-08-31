/**
 * AppIconSection - pick the home-screen app icon (iOS only).
 *
 * Three crown variants: the default dark mark, a light mark, and a regent-blue
 * mark. Selecting one calls the alternate-icon API immediately; iOS persists
 * the choice itself, so the current selection is read straight from the system
 * on mount. Hidden on non-iOS platforms and in Expo Go, where the native
 * module is unavailable.
 *
 * Themed via useTheme + a memoized makeStyles(theme); callers stay transparent.
 * No entry animation - a deliberate settings control; selection is shown with
 * a color change, not motion.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, Text, View } from 'react-native';
import { Image, type ImageSource } from 'expo-image';

import { RegentPressable } from '@/components/ui/RegentPressable';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import type * as AppIconsModule from 'expo-alternate-app-icons';

// `null` selects the default icon (the bundled primary app icon).
type IconChoice = {
  name: string | null;
  label: string;
  source: ImageSource;
};

const ICON_CHOICES: IconChoice[] = [
  { name: null, label: 'Dark', source: require('@/assets/images/icon-regents.png') },
  { name: 'Light', label: 'Light', source: require('@/assets/images/icon-regents-light.png') },
  { name: 'Blue', label: 'Blue', source: require('@/assets/images/icon-regents-blue.png') },
];

type AppIconSectionProps = {
  isExpoGo: boolean;
};

export function AppIconSection({ isExpoGo }: AppIconSectionProps) {
  // The native module only exists in the iOS dev client / release build.
  if (Platform.OS !== 'ios' || isExpoGo) return null;

  const appIcons = require('expo-alternate-app-icons') as typeof AppIconsModule;
  if (!appIcons.supportsAlternateIcons) return null;

  return <AppIconPicker appIcons={appIcons} />;
}

function AppIconPicker({ appIcons }: { appIcons: typeof AppIconsModule }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  // iOS owns the persisted choice; mirror it into state for instant feedback.
  const [activeIcon, setActiveIcon] = useState<string | null>(() => appIcons.getAppIconName());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [changingIcon, setChangingIcon] = useState(false);
  const changingIconRef = useRef(false);
  const previousErrorRef = useRef<string | null>(null);

  useEffect(() => {
    const previousError = previousErrorRef.current;
    previousErrorRef.current = errorMessage;
    if (Platform.OS === 'ios' && errorMessage && errorMessage !== previousError) {
      AccessibilityInfo.announceForAccessibilityWithOptions(errorMessage, { queue: true });
    }
  }, [errorMessage]);

  const selectIcon = async (name: string | null) => {
    if (changingIconRef.current || name === activeIcon) return;
    changingIconRef.current = true;
    setChangingIcon(true);
    setErrorMessage(null);
    setActiveIcon(name);
    try {
      await appIcons.setAlternateAppIcon(name);
    } catch {
      setErrorMessage('Could not change the app icon. Try again.');
    } finally {
      setActiveIcon(appIcons.getAppIconName());
      changingIconRef.current = false;
      setChangingIcon(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.label}>APP ICON</Text>
      <View style={styles.row}>
        {ICON_CHOICES.map((choice) => {
          const selected = activeIcon === choice.name;
          return (
            <RegentPressable
              key={choice.label}
              haptic="selection"
              accessibilityRole="button"
              accessibilityLabel={`Use the ${choice.label.toLowerCase()} app icon`}
              accessibilityState={{ busy: changingIcon, disabled: changingIcon, selected }}
              disabled={changingIcon}
              style={styles.option}
              onPress={() => selectIcon(choice.name)}
            >
              <View style={[styles.iconFrame, selected && styles.iconFrameSelected]}>
                <Image source={choice.source} style={styles.iconImage} contentFit="cover" />
              </View>
              <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>
                {choice.label}
              </Text>
            </RegentPressable>
          );
        })}
      </View>
      {errorMessage ? (
        <Text
          accessibilityLiveRegion={Platform.OS === 'android' ? 'polite' : undefined}
          style={styles.errorText}
        >
          {errorMessage}
        </Text>
      ) : null}
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
    row: {
      flexDirection: 'row',
      gap: space.s3,
    },
    option: {
      flex: 1,
      alignItems: 'center',
      gap: space.s2,
    },
    // Neutral frame; selection reads as the accent edge, not motion.
    iconFrame: {
      borderRadius: radius.md,
      borderWidth: 2,
      borderColor: colors.hairline,
      padding: 2,
    },
    iconFrameSelected: {
      borderColor: colors.accent,
    },
    iconImage: {
      width: 56,
      height: 56,
      borderRadius: radius.sm,
    },
    optionLabel: {
      color: colors.textMuted,
      fontSize: type.label.size,
      fontFamily: fonts.ui,
    },
    optionLabelSelected: {
      color: colors.accent,
    },
    errorText: {
      color: colors.error,
      fontSize: type.caption.size,
      lineHeight: type.caption.line,
      fontFamily: fonts.ui,
    },
  });
}
