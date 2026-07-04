import { CDPHooksProvider, Config } from "@coinbase/cdp-hooks";
import { Redirect, Stack, useSegments } from "expo-router";
import { PrivyProvider } from "@privy-io/expo";

import { AuthGate } from "@/components/AuthGate";
import { AuthInitializer } from "@/components/AuthInitializer";
import { PushNotificationRouter } from "@/components/PushNotificationRouter";
import { PendingRouteDrainer } from "@/components/PendingRouteDrainer";
import { useAppBootstrap } from "@/hooks/useAppBootstrap";
import { useRegentsAuth } from "@/hooks/useRegentsAuth";
import { fetchCdpAuthToken } from "@/utils/fetchCdpAuthToken";
import { hasRegentsAccountConfig, readMobilePublicConfig } from "@/utils/mobilePublicConfig";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { FONTS, THEME_COLORS } from "@/theme/tokens";
import { useMemo } from "react";
import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';
import { StyleSheet, Text, View } from "react-native";

// This fallback screen renders before the ThemeProvider wraps the tree, so it
// cannot read useTheme(). It uses the dark token set directly (app default is
// follow-OS, and this pre-config screen is always shown on the dark ground).
const c = THEME_COLORS.dark;
const cardSlideRight = { presentation: 'card', animation: 'slide_from_right' } as const;
const cardSlideBottom = { presentation: 'card', animation: 'slide_from_bottom' } as const;

function WalletProviders({
  children,
  cdpProjectId,
}: {
  children: React.ReactNode;
  cdpProjectId: string;
}) {
  const { getAccessToken } = useRegentsAuth();

  const cdpConfig = useMemo<Config>(() => ({
    projectId: cdpProjectId,
    basePath: "https://api.cdp.coinbase.com/platform",
    customAuth: {
      getJwt: async () => {
        const privyAccessToken = await getAccessToken();

        if (!privyAccessToken) {
          return undefined;
        }

        return fetchCdpAuthToken(privyAccessToken);
      },
    },
    ethereum: {
      createOnLogin: "smart"
    },
    solana: {
      createOnLogin: true
    },
    useMock: false
  }), [cdpProjectId, getAccessToken]);

  return (
    <CDPHooksProvider config={cdpConfig}>
      <AuthInitializer>
        <PushNotificationRouter />
        <PendingRouteDrainer />
        <AuthGate>
          {children}
        </AuthGate>
      </AuthInitializer>
    </CDPHooksProvider>
  );
}

export default function RootLayout() {
  useAppBootstrap();
  const segments = useSegments();
  const config = readMobilePublicConfig();
  const canUseRegentsAccount = hasRegentsAccountConfig(config);
  const isLoginRoute = segments[0] === 'auth' && segments[1] === 'login';

  if (!canUseRegentsAccount && !isLoginRoute) {
    return <Redirect href="/auth/login" />;
  }

  if (!canUseRegentsAccount) {
    return (
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen
          name="auth/login"
          options={{
            headerShown: false,
            gestureEnabled: false,
            animation: 'fade',
          }}
        />
      </Stack>
    );
  }

  if (!canUseRegentsAccount || !config.privyAppId || !config.privyClientId || !config.cdpProjectId) {
    return (
      <View style={styles.missingConfigContainer}>
        <View style={styles.missingConfigCard}>
          <View style={styles.missingConfigBadge}>
            <Text style={styles.missingConfigBadgeText}>Regents Mobile</Text>
          </View>
          <Text style={styles.missingConfigTitle}>Sign-in is not ready yet</Text>
          <Text style={styles.missingConfigText}>
            Finish the mobile sign-in details for this build, then reopen the app.
          </Text>
          <View style={styles.missingConfigChecklist}>
            <View style={styles.missingConfigRow}>
              <View style={styles.missingConfigDot} />
              <Text style={styles.missingConfigItem}>Add the sign-in details for Regents Mobile.</Text>
            </View>
            <View style={styles.missingConfigRow}>
              <View style={styles.missingConfigDot} />
              <Text style={styles.missingConfigItem}>Connect wallet access for this build.</Text>
            </View>
            <View style={styles.missingConfigRow}>
              <View style={styles.missingConfigDot} />
              <Text style={styles.missingConfigItem}>Reopen the app after saving those details.</Text>
            </View>
          </View>
        </View>
      </View>
    );
  }

  return (
    <ThemeProvider>
    <PrivyProvider appId={config.privyAppId} clientId={config.privyClientId}>
      <WalletProviders cdpProjectId={config.cdpProjectId}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen
            name="auth/login"
            options={{
              headerShown: false,
              gestureEnabled: false,
              animation: 'fade',
            }}
          />
          <Stack.Screen name="email-verify" options={cardSlideRight} />
          <Stack.Screen name="email-code" options={cardSlideRight} />
          <Stack.Screen name="phone-verify" options={cardSlideRight} />
          <Stack.Screen name="phone-code" options={cardSlideRight} />
          <Stack.Screen name="onramp-return" options={cardSlideBottom} />
          <Stack.Screen name="offramp-send" options={cardSlideBottom} />
          <Stack.Screen name="staking" options={cardSlideRight} />
          <Stack.Screen name="agent/[id]" options={cardSlideRight} />
          <Stack.Screen name="agent/[id]/regent-manager" options={cardSlideRight} />
          <Stack.Screen name="agent/[id]/voice" options={cardSlideBottom} />
          <Stack.Screen name="message/[id]" options={cardSlideRight} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
      </WalletProviders>
    </PrivyProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  missingConfigContainer: {
    flex: 1,
    backgroundColor: c.bg,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  missingConfigCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: c.surfaceElevated,
    borderWidth: 1,
    borderColor: c.hairlineStrong,
    borderRadius: 28,
    padding: 24,
    gap: 14,
    shadowColor: c.accent,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 3,
  },
  missingConfigBadge: {
    alignSelf: 'flex-start',
    backgroundColor: c.accentWash,
    borderWidth: 1,
    borderColor: c.hairlineStrong,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  missingConfigBadgeText: {
    color: c.accent,
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    fontFamily: FONTS.ui,
  },
  missingConfigTitle: {
    color: c.text,
    fontSize: 28,
    lineHeight: 34,
    fontFamily: FONTS.title,
  },
  missingConfigText: {
    color: c.textMuted,
    fontSize: 16,
    lineHeight: 24,
    fontFamily: FONTS.ui,
  },
  missingConfigChecklist: {
    marginTop: 4,
    backgroundColor: c.accentWash,
    borderWidth: 1,
    borderColor: c.hairlineStrong,
    borderRadius: 18,
    padding: 14,
    gap: 12,
  },
  missingConfigRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  missingConfigDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 7,
    backgroundColor: c.accent,
  },
  missingConfigItem: {
    flex: 1,
    color: c.text,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONTS.ui,
  },
});
