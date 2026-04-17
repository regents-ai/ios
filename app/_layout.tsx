import { CDPHooksProvider, Config } from "@coinbase/cdp-hooks";
import { Stack } from "expo-router";
import { PrivyProvider } from "@privy-io/expo";

import { AuthGate } from "@/components/AuthGate";
import { AuthInitializer } from "@/components/AuthInitializer";
import { COLORS } from "@/constants/Colors";
import { FONTS } from "@/constants/Typography";
import { useRegentsAuth } from "@/hooks/useRegentsAuth";
import { fetchCdpAuthToken } from "@/utils/fetchCdpAuthToken";
import { getTestWalletEvm, getTestWalletSol, hydrateSandboxMode, hydrateTestSession, hydrateVerifiedPhone, hydrateLifetimeTransactionThreshold, isTestSessionActive, setCurrentSolanaAddress, setCurrentWalletAddress } from "@/utils/sharedState";
import { useEffect, useMemo } from "react";
import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';
import { StyleSheet, Text, View } from "react-native";

const { DARK_BG, TEXT_PRIMARY, TEXT_SECONDARY } = COLORS;

function WalletProviders({ children }: { children: React.ReactNode }) {
  const { getAccessToken } = useRegentsAuth();

  const cdpConfig = useMemo<Config>(() => ({
    projectId: process.env.EXPO_PUBLIC_CDP_PROJECT_ID!,
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
  }), [getAccessToken]);

  return (
    <CDPHooksProvider config={cdpConfig}>
      <AuthInitializer>
        <AuthGate>
          {children}
        </AuthGate>
      </AuthInitializer>
    </CDPHooksProvider>
  );
}

export default function RootLayout() {
  useEffect(() => {
    // Hydrate sandbox mode preference
    hydrateSandboxMode().catch(() => {});

    // Hydrate phone verification
    hydrateVerifiedPhone().catch(() => {});

    // Hydrate lifetime transaction threshold
    hydrateLifetimeTransactionThreshold().catch(() => {});

    // Hydrate test session (TestFlight)
    hydrateTestSession().then(() => {
      if (isTestSessionActive()) {
        setCurrentWalletAddress(getTestWalletEvm());
        setCurrentSolanaAddress(getTestWalletSol());
      }
    }).catch(() => {});
  }, []);

  const privyAppId = process.env.EXPO_PUBLIC_PRIVY_APP_ID;
  const privyClientId = process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID;
  const cdpProjectId = process.env.EXPO_PUBLIC_CDP_PROJECT_ID;

  if (!privyAppId || !privyClientId || !cdpProjectId) {
    return (
      <View style={styles.missingConfigContainer}>
        <Text style={styles.missingConfigTitle}>Missing app setup</Text>
        <Text style={styles.missingConfigText}>
          Add the Privy app ID, Privy client ID, and Coinbase project ID before opening the wallet.
        </Text>
      </View>
    );
  }

  return (
    <PrivyProvider appId={privyAppId} clientId={privyClientId}>
      <WalletProviders>
          <Stack screenOptions={{ headerShown: false }}>
            {/* Auth screens */}
            <Stack.Screen
              name="auth/login"
              options={{
                headerShown: false,
                gestureEnabled: false,  // Can't swipe back from login
                animation: 'fade',
              }}
            />

            {/* Phone verification pages - no tabs */}
            <Stack.Screen
              name="phone-verify"
              options={{
                presentation: 'card',
                animation: 'slide_from_right',
              }}
            />
            <Stack.Screen
                name="phone-code"
                options={{
                  presentation: 'card',
                  animation: 'slide_from_right',
                }}
            />

            {/* Offramp send — reached via deep link after Coinbase sell flow */}
            <Stack.Screen
              name="offramp-send"
              options={{
                presentation: 'card',
                animation: 'slide_from_bottom',
              }}
            />

            {/* Main app with tabs */}
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
  missingConfigTitle: {
    color: TEXT_PRIMARY,
    fontSize: 28,
    marginBottom: 12,
    textAlign: 'center',
    fontFamily: FONTS.heading,
  },
  missingConfigText: {
    color: TEXT_SECONDARY,
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    fontFamily: FONTS.body,
  },
});
