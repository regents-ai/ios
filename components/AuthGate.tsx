/**
 * Auth Gate - Enforces authentication before app access
 *
 * Wraps the entire app to ensure users are logged in.
 * Shows loading spinner while checking auth status.
 * Redirects to login screen if not authenticated.
 *
 * TestFlight accounts bypass this check automatically.
 */

import { COLORS } from '@/constants/Colors';
import { FONTS } from '@/constants/Typography';
import { useRegentsAuth } from '@/hooks/useRegentsAuth';
import { isTestSessionActive } from '@/utils/sharedState';
import { useIsInitialized } from '@coinbase/cdp-hooks';
import { router, useRootNavigationState, useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

const { DARK_BG, BLUE, TEXT_PRIMARY, TEXT_SECONDARY, CARD_BG, BORDER } = COLORS;

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { isInitialized } = useIsInitialized();
  const { error: authError, isAuthenticated: isPrivyAuthenticated, isReady: isPrivyReady } = useRegentsAuth();
  const segments = useSegments();
  const navigationState = useRootNavigationState();
  const testSession = isTestSessionActive();
  const [isReady, setIsReady] = useState(false);
  const [hasCheckedAuth, setHasCheckedAuth] = useState(false);
  const [startupTimeoutReached, setStartupTimeoutReached] = useState(false);

  const isAuthenticated = testSession || isPrivyAuthenticated;
  const requiresWalletInitialization = !testSession && isPrivyAuthenticated;
  const walletReady = !requiresWalletInitialization || isInitialized;

  useEffect(() => {
    if (navigationState?.key) {
      setIsReady(true);
    }
  }, [navigationState?.key]);

  useEffect(() => {
    if (isPrivyReady && walletReady) {
      const timer = setTimeout(() => {
        setHasCheckedAuth(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isPrivyReady, walletReady]);

  useEffect(() => {
    if (testSession || isAuthenticated || isPrivyReady) {
      setStartupTimeoutReached(false);
      return;
    }

    const timer = setTimeout(() => {
      setStartupTimeoutReached(true);
    }, 4000);

    return () => clearTimeout(timer);
  }, [isAuthenticated, isPrivyReady, testSession]);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    if (!isPrivyReady || !walletReady) {
      return;
    }

    if (!hasCheckedAuth) {
      return;
    }

    const inAuthGroup = segments[0] === 'auth';
    const publicRoutes = ['email-verify', 'email-code', 'phone-verify', 'phone-code'];
    const isPublicRoute = publicRoutes.includes(segments[0]);

    if (!isAuthenticated && !inAuthGroup && !isPublicRoute) {
      setTimeout(() => {
        try {
          router.replace('/auth/login');
        } catch (e) {
          console.error('Navigation error:', e);
        }
      }, 0);
    } else if (isAuthenticated && inAuthGroup) {
      setTimeout(() => {
        try {
          router.replace('/wallet');
        } catch (e) {
          console.error('Navigation error:', e);
        }
      }, 0);
    }
  }, [hasCheckedAuth, isAuthenticated, isPrivyReady, isReady, segments, testSession, walletReady]);

  if (!isReady || !isPrivyReady || !walletReady || !hasCheckedAuth) {
    if (!isAuthenticated && !testSession && (authError || startupTimeoutReached)) {
      return (
        <View style={styles.loadingContainer}>
          <View style={styles.issueCard}>
            <Text style={styles.issueTitle}>Sign-in is unavailable</Text>
            <Text style={styles.issueText}>
              This build cannot open the wallet right now. Finish setup, then try again.
            </Text>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={BLUE} />
        <Text style={styles.loadingText}>Opening your wallet...</Text>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: DARK_BG,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 15,
    color: TEXT_SECONDARY,
    fontFamily: FONTS.body,
  },
  issueCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 24,
    padding: 24,
    gap: 12,
    shadowColor: BLUE,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 3,
  },
  issueTitle: {
    color: TEXT_PRIMARY,
    fontSize: 24,
    textAlign: 'center',
    fontFamily: FONTS.heading,
  },
  issueText: {
    color: TEXT_SECONDARY,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    fontFamily: FONTS.body,
  },
});
