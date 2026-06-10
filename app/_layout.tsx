import { CDPHooksProvider, Config } from "@coinbase/cdp-hooks";
import { Redirect, Stack, useSegments } from "expo-router";
import { PrivyProvider } from "@privy-io/expo";

import { AuthGate } from "@/components/AuthGate";
import { AuthInitializer } from "@/components/AuthInitializer";
import { RegentsXmtpProvider } from "@/components/xmtp/RegentsXmtpProvider";
import { COLORS } from "@/constants/Colors";
import { FONTS } from "@/constants/Typography";
import { useAppBootstrap } from "@/hooks/useAppBootstrap";
import { useRegentsAuth } from "@/hooks/useRegentsAuth";
import { fetchCdpAuthToken } from "@/utils/fetchCdpAuthToken";
import { hasRegentsAccountConfig, readMobilePublicConfig } from "@/utils/mobilePublicConfig";
import type { XmtpEnvironment } from "@/types/regents";
import { useMemo } from "react";
import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';
import { StyleSheet, Text, View } from "react-native";

const { DARK_BG, TEXT_PRIMARY, TEXT_SECONDARY } = COLORS;
const cardSlideRight = { presentation: 'card', animation: 'slide_from_right' } as const;
const cardSlideBottom = { presentation: 'card', animation: 'slide_from_bottom' } as const;

function WalletProviders({
  children,
  cdpProjectId,
  xmtpEnvironment,
}: {
  children: React.ReactNode;
  cdpProjectId: string;
  xmtpEnvironment: XmtpEnvironment;
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
        <AuthGate>
          <RegentsXmtpProvider environment={xmtpEnvironment}>
            {children}
          </RegentsXmtpProvider>
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

  if (!canUseRegentsAccount || !config.privyAppId || !config.privyClientId || !config.cdpProjectId || !config.xmtpEnvironment) {
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
              <Text style={styles.missingConfigItem}>Choose the message network for this build.</Text>
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
    <PrivyProvider appId={config.privyAppId} clientId={config.privyClientId}>
      <WalletProviders cdpProjectId={config.cdpProjectId} xmtpEnvironment={config.xmtpEnvironment}>
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
          <Stack.Screen name="terminal/[id]" options={cardSlideRight} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
      </WalletProviders>
    </PrivyProvider>
  );
}

const styles = StyleSheet.create({
  missingConfigContainer: {
    flex: 1,
    backgroundColor: DARK_BG,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  missingConfigCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: COLORS.CARD_BG,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    borderRadius: 28,
    padding: 24,
    gap: 14,
    shadowColor: COLORS.BLUE,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 3,
  },
  missingConfigBadge: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.BLUE_WASH,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  missingConfigBadgeText: {
    color: COLORS.BLUE,
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    fontFamily: FONTS.body,
  },
  missingConfigTitle: {
    color: TEXT_PRIMARY,
    fontSize: 28,
    lineHeight: 34,
    fontFamily: FONTS.heading,
  },
  missingConfigText: {
    color: TEXT_SECONDARY,
    fontSize: 16,
    lineHeight: 24,
    fontFamily: FONTS.body,
  },
  missingConfigChecklist: {
    marginTop: 4,
    backgroundColor: COLORS.BLUE_WASH,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
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
    backgroundColor: COLORS.BLUE,
  },
  missingConfigItem: {
    flex: 1,
    color: TEXT_PRIMARY,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONTS.body,
  },
});
