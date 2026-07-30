import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { EaseView } from 'react-native-ease';

import { getMotionPreset } from '@/components/motion/easePresets';
import { useReducedMotion } from '@/components/motion/useReducedMotion';
import { RegentPressable } from '@/components/ui/RegentPressable';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { routes } from '@/utils/navigation/routes';

const EMPTY_RETURN_URL = 'regentsmobile://portal-return';

export default function PortalReturnScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const reducedMotionEnabled = useReducedMotion();

  const returnUrl = useMemo(() => {
    const keys = Object.keys(params);
    const code = params.code;
    const state = params.state;
    if (
      keys.length !== 2 ||
      !keys.includes('code') ||
      !keys.includes('state') ||
      typeof code !== 'string' ||
      typeof state !== 'string'
    ) {
      return EMPTY_RETURN_URL;
    }

    const query = new URLSearchParams({ code, state });
    return `${EMPTY_RETURN_URL}?${query.toString()}`;
  }, [params]);

  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace(routes.portalPairing(returnUrl));
    }, 0);
    return () => clearTimeout(timer);
  }, [returnUrl, router]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <EaseView {...getMotionPreset('card', reducedMotionEnabled)} style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name="link-outline" size={28} color={colors.onAccent} />
          </View>
          <Text style={styles.title}>Finishing your connection</Text>
          <Text style={styles.body}>
            Regents is checking your Nous Portal pairing now.
          </Text>
          <RegentPressable
            style={styles.primaryButton}
            onPress={() => router.replace(routes.portalPairing(returnUrl))}
          >
            <Text style={styles.primaryButtonText}>Continue</Text>
          </RegentPressable>
        </EaseView>
      </View>
    </SafeAreaView>
  );
}

function makeStyles({ colors, fonts, radius, space, type }: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    content: { flex: 1, justifyContent: 'center', padding: space.s5 },
    card: {
      backgroundColor: colors.surfaceElevated,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.hairlineStrong,
      borderRadius: radius.lg,
      padding: space.s5,
      gap: space.s4,
    },
    iconWrap: {
      width: 56,
      height: 56,
      borderRadius: radius.full,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      color: colors.text,
      fontSize: type.title.size,
      lineHeight: type.title.line,
      fontFamily: fonts.title,
    },
    body: {
      color: colors.textMuted,
      fontSize: type.label.size,
      lineHeight: type.label.line,
      fontFamily: fonts.ui,
    },
    primaryButton: {
      backgroundColor: colors.accent,
      borderRadius: radius.md,
      paddingHorizontal: space.s4,
      paddingVertical: space.s3,
      alignItems: 'center',
    },
    primaryButtonText: {
      color: colors.onAccent,
      fontSize: type.label.size,
      fontFamily: fonts.ui,
    },
  });
}
