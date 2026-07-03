/**
 * First-open welcome screen.
 *
 * Aesthetic modeled on the OpenClaw opening (bd regent-o5by): a brand glow
 * blooms outward from center, the wordmark fades in over it, then a connect
 * sheet slides up from the bottom offering the three start paths:
 *   1. Existing Hermes Agent  -> /onboarding/connect-hermes
 *   2. Create Agent in Regents Cloud -> /onboarding/create-cloud-agent
 *   3. (low-key) Onramp USDC to an agent -> Fund tab (existing onramp)
 *
 * Shows once per install (utils/onboardingState). Returning users reach the
 * same three paths from Settings -> Connect.
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Easing,
  Image,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import { useReducedMotion } from '@/components/motion/useReducedMotion';
import { RegentPressable } from '@/components/ui/RegentPressable';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { hexToRgb } from '@/theme/tokens';
import { markOnboardingSeen } from '@/utils/onboardingState';

/** Concentric glow bands, inner to outer: relative size and settled opacity. */
const GLOW_BANDS = [
  { scale: 0.34, opacity: 0.4 },
  { scale: 0.5, opacity: 0.28 },
  { scale: 0.68, opacity: 0.18 },
  { scale: 0.88, opacity: 0.11 },
  { scale: 1.1, opacity: 0.06 },
  { scale: 1.35, opacity: 0.03 },
] as const;

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const EASE_SHEET = Easing.bezier(0.32, 0.72, 0, 1);

export default function OnboardingWelcomeScreen() {
  const router = useRouter();
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const { width } = useWindowDimensions();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { colors } = theme;

  // One driver per glow band, plus title and sheet drivers.
  const bandDrivers = useRef(GLOW_BANDS.map(() => new Animated.Value(0))).current;
  const breathe = useRef(new Animated.Value(0)).current;
  const titleDriver = useRef(new Animated.Value(0)).current;
  const sheetDriver = useRef(new Animated.Value(0)).current;

  // This screen is one-shot: mark it seen as soon as it appears.
  useEffect(() => {
    void markOnboardingSeen();
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      bandDrivers.forEach((driver) => driver.setValue(1));
      titleDriver.setValue(1);
      sheetDriver.setValue(1);
      return;
    }

    const bloom = Animated.stagger(
      70,
      bandDrivers.map((driver) =>
        Animated.timing(driver, {
          toValue: 1,
          duration: 620,
          easing: EASE_OUT,
          useNativeDriver: true,
        }),
      ),
    );
    const title = Animated.timing(titleDriver, {
      toValue: 1,
      duration: 480,
      delay: 380,
      easing: EASE_OUT,
      useNativeDriver: true,
    });
    const sheet = Animated.timing(sheetDriver, {
      toValue: 1,
      duration: 440,
      delay: 700,
      easing: EASE_SHEET,
      useNativeDriver: true,
    });
    // Slow breathing loop keeps the glow alive after the bloom settles.
    const breathing = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1,
          duration: 2600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(breathe, {
          toValue: 0,
          duration: 2600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );

    const entry = Animated.parallel([bloom, title, sheet]);
    entry.start(({ finished }) => {
      if (finished) {
        breathing.start();
      }
    });

    return () => {
      entry.stop();
      breathing.stop();
    };
  }, [bandDrivers, breathe, reducedMotion, sheetDriver, titleDriver]);

  const glowBase = Math.round(width * 1.15);
  const accentRgb = hexToRgb(colors.accent);
  const breatheScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.045] });

  const finish = (destination: Parameters<typeof router.replace>[0]) => {
    router.replace(destination);
  };

  return (
    <View style={styles.container}>
      {/* Brand glow: concentric accent bands blooming from center. */}
      <View pointerEvents="none" style={styles.glowLayer}>
        <Animated.View style={[styles.glowCenter, { transform: [{ scale: breatheScale }] }]}>
          {GLOW_BANDS.map((band, index) => {
            const size = glowBase * band.scale;
            const driver = bandDrivers[index];
            return (
              <Animated.View
                key={band.scale}
                style={[
                  styles.glowBand,
                  {
                    width: size,
                    height: size,
                    borderRadius: size * 0.32,
                    backgroundColor: `rgba(${accentRgb}, ${band.opacity})`,
                    opacity: driver,
                    transform: [
                      {
                        scale: driver.interpolate({ inputRange: [0, 1], outputRange: [0.78, 1] }),
                      },
                    ],
                  },
                ]}
              />
            );
          })}
        </Animated.View>
      </View>

      {/* Wordmark. */}
      <View pointerEvents="none" style={styles.titleLayer}>
        <Animated.Text
          style={[
            styles.brand,
            {
              opacity: titleDriver,
              transform: [
                { translateY: titleDriver.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
              ],
            },
          ]}
        >
          Regents
        </Animated.Text>
      </View>

      {/* Connect sheet. */}
      <Animated.View
        style={[
          styles.sheet,
          {
            opacity: reducedMotion ? 1 : sheetDriver,
            transform: [
              { translateY: sheetDriver.interpolate({ inputRange: [0, 1], outputRange: [440, 0] }) },
            ],
          },
        ]}
      >
        <SafeAreaView>
          <View style={styles.sheetHeaderRow}>
            <Image source={require('@/assets/images/icon.png')} style={styles.appIcon} />
            <RegentPressable
              haptic="selection"
              pressStyle="chip"
              style={styles.skipPill}
              onPress={() => finish('/auth/login')}
            >
              <Text style={styles.skipText}>Skip</Text>
            </RegentPressable>
          </View>

          <Text style={styles.sheetTitle}>Connect</Text>
          <Text style={styles.sheetSubtitle}>Choose how you want to start with Regents.</Text>

          <View style={styles.divider} />

          <RegentPressable
            haptic="selection"
            pressStyle="card"
            style={styles.optionRow}
            onPress={() => router.push('/onboarding/connect-hermes')}
          >
            <View style={styles.optionIcon}>
              <Ionicons name="terminal-outline" size={22} color={colors.accent} />
            </View>
            <View style={styles.optionCopy}>
              <Text style={styles.optionTitle}>Existing Hermes Agent</Text>
              <Text style={styles.optionDetail}>Link the agent already running on your computer</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </RegentPressable>

          <View style={styles.rowDivider} />

          <RegentPressable
            haptic="selection"
            pressStyle="card"
            style={styles.optionRow}
            onPress={() => router.push('/onboarding/create-cloud-agent')}
          >
            <View style={styles.optionIcon}>
              <Ionicons name="cloud-outline" size={22} color={colors.accent} />
            </View>
            <View style={styles.optionCopy}>
              <Text style={styles.optionTitle}>Create Agent in Regents Cloud</Text>
              <Text style={styles.optionDetail}>Set up a new agent, hosted for you</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </RegentPressable>

          <View style={styles.rowDivider} />

          {/* Deliberately quieter third path. */}
          <RegentPressable
            haptic="selection"
            pressStyle="card"
            style={styles.tertiaryRow}
            onPress={() => finish('/(tabs)/wallet')}
          >
            <Ionicons name="cash-outline" size={16} color={colors.textMuted} />
            <Text style={styles.tertiaryText}>Onramp USDC to an agent</Text>
          </RegentPressable>
        </SafeAreaView>
      </Animated.View>
    </View>
  );
}

function makeStyles({ colors, fonts, type, space, radius }: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    glowLayer: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
    },
    glowCenter: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    glowBand: {
      position: 'absolute',
    },
    titleLayer: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      // Sit the wordmark slightly above center so the sheet never crowds it.
      paddingBottom: 220,
    },
    brand: {
      color: colors.text,
      fontSize: 44,
      lineHeight: 52,
      fontFamily: fonts.title,
    },
    sheet: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: colors.surfaceElevated,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.hairlineStrong,
      paddingHorizontal: space.s5,
      paddingTop: space.s5,
      paddingBottom: space.s4,
    },
    sheetHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: space.s4,
    },
    appIcon: {
      width: 40,
      height: 40,
      borderRadius: 10,
    },
    skipPill: {
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.hairlineStrong,
      borderRadius: radius.full,
      paddingHorizontal: space.s4,
      paddingVertical: space.s2,
    },
    skipText: {
      color: colors.text,
      fontSize: type.label.size,
      fontFamily: fonts.ui,
    },
    sheetTitle: {
      color: colors.text,
      fontSize: type.title.size,
      lineHeight: type.title.line,
      fontFamily: fonts.title,
    },
    sheetSubtitle: {
      color: colors.textMuted,
      fontSize: type.label.size,
      lineHeight: type.label.line,
      fontFamily: fonts.ui,
      marginTop: space.s1,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.hairline,
      marginVertical: space.s4,
    },
    rowDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.hairline,
      marginLeft: 52,
    },
    optionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.s3,
      paddingVertical: space.s3,
    },
    optionIcon: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      backgroundColor: colors.accentWash,
      alignItems: 'center',
      justifyContent: 'center',
    },
    optionCopy: { flex: 1, minWidth: 0, gap: 2 },
    optionTitle: {
      color: colors.text,
      fontSize: type.body.size,
      fontFamily: fonts.title,
    },
    optionDetail: {
      color: colors.textMuted,
      fontSize: type.caption.size,
      lineHeight: type.caption.line,
      fontFamily: fonts.ui,
    },
    tertiaryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space.s2,
      paddingVertical: space.s3,
      marginTop: space.s1,
    },
    tertiaryText: {
      color: colors.textMuted,
      fontSize: type.label.size,
      fontFamily: fonts.ui,
    },
  });
}
