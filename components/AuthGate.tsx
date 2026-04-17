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

const { DARK_BG, BLUE } = COLORS;

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { isInitialized } = useIsInitialized();
  const { isAuthenticated: isPrivyAuthenticated, isReady: isPrivyReady } = useRegentsAuth();
  const segments = useSegments();
  const navigationState = useRootNavigationState();
  const testSession = isTestSessionActive();
  const [isReady, setIsReady] = useState(false);
  const [hasCheckedAuth, setHasCheckedAuth] = useState(false);

  const isAuthenticated = testSession || isPrivyAuthenticated;

  useEffect(() => {
    if (navigationState?.key) {
      setIsReady(true);
    }
  }, [navigationState?.key]);

  useEffect(() => {
    if (isPrivyReady && isInitialized) {
      const timer = setTimeout(() => {
        setHasCheckedAuth(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isInitialized, isPrivyReady]);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    if (!isPrivyReady || !isInitialized) {
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
  }, [hasCheckedAuth, isAuthenticated, isInitialized, isPrivyReady, isReady, segments, testSession]);

  if (!isReady || !isPrivyReady || !isInitialized || !hasCheckedAuth) {
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
  },
  loadingText: {
    marginTop: 16,
    fontSize: 15,
    color: '#D0D5DA',
    fontFamily: FONTS.body,
  },
});
