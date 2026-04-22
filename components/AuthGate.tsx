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
import { clearWalletInitFailureMessage, getWalletInitFailureMessage } from '@/utils/authStartupState';
import { isAuthManagedRoute, resolveAuthGateState } from '@/utils/authFlowState';
import { useRegentsAuth } from '@/hooks/useRegentsAuth';
import { getEaseAnimate, getEaseInitialAnimate, getEaseTransition } from '@/components/motion/easePresets';
import { useReducedMotion } from '@/components/motion/useReducedMotion';
import { isTestSessionActive } from '@/utils/state/reviewSessionState';
import { setCountry, setSubdivision } from '@/utils/state/locationState';
import { setSandboxMode } from '@/utils/state/sandboxState';
import { setCurrentSolanaAddress, setCurrentWalletAddress, setManualWalletAddress } from '@/utils/state/walletRuntimeState';
import { useIsInitialized, useSignOut } from '@coinbase/cdp-hooks';
import { router, useRootNavigationState, useSegments } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EaseView } from 'react-native-ease';

const { DARK_BG, BLUE, TEXT_PRIMARY, TEXT_SECONDARY, CARD_BG, BORDER } = COLORS;

export function AuthGate({ children }: { children: React.ReactNode }) {
  const reducedMotionEnabled = useReducedMotion();
  const { isInitialized } = useIsInitialized();
  const { error: authError, isAuthenticated: isPrivyAuthenticated, isReady: isPrivyReady, signOut: signOutIdentity } = useRegentsAuth();
  const { signOut: signOutWallet } = useSignOut();
  const segments = useSegments();
  const navigationState = useRootNavigationState();
  const testSession = isTestSessionActive();
  const [isReady, setIsReady] = useState(false);
  const [hasCheckedAuth, setHasCheckedAuth] = useState(false);
  const [startupTimeoutReached, setStartupTimeoutReached] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const privyReady = testSession ? true : isPrivyReady;

  const isAuthenticated = testSession || isPrivyAuthenticated;
  const requiresWalletInitialization = !testSession && isPrivyAuthenticated;
  const walletReady = !requiresWalletInitialization || isInitialized;
  const gateState = resolveAuthGateState({
    isReady,
    isPrivyReady: privyReady,
    walletReady,
    hasCheckedAuth,
    isAuthenticated,
    testSession,
    hasAuthError: !!authError,
    startupTimeoutReached,
    walletInitFailureMessage: getWalletInitFailureMessage(),
  });

  const handleWalletRecovery = useCallback(async () => {
    try {
      clearWalletInitFailureMessage();
      await signOutIdentity();
      await signOutWallet();
    } catch (error) {
      console.error('Sign out failed:', error);
    } finally {
      setCurrentWalletAddress(null);
      setCurrentSolanaAddress(null);
      setManualWalletAddress(null);
      setCountry('US');
      setSubdivision('CA');
      setSandboxMode(true);
      setStartupTimeoutReached(false);
      setHasCheckedAuth(false);
      setRetryKey(prev => prev + 1);
      router.replace('/auth/login');
    }
  }, [signOutIdentity, signOutWallet]);

  useEffect(() => {
    if (navigationState?.key) {
      setIsReady(true);
    }
  }, [navigationState?.key]);

  useEffect(() => {
    if (privyReady && walletReady) {
      const timer = setTimeout(() => {
        setHasCheckedAuth(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [privyReady, walletReady]);

  useEffect(() => {
    if (testSession || isAuthenticated || privyReady) {
      setStartupTimeoutReached(false);
      return;
    }

    const timer = setTimeout(() => {
      setStartupTimeoutReached(true);
    }, 4000);

    return () => clearTimeout(timer);
  }, [isAuthenticated, privyReady, retryKey, testSession]);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    if (!privyReady || !walletReady) {
      return;
    }

    if (!hasCheckedAuth) {
      return;
    }

    const currentSegment = segments[0];
    const inManagedAuthRoute = isAuthManagedRoute(currentSegment);
    const redirectTo = !isAuthenticated && !inManagedAuthRoute ? '/auth/login' : isAuthenticated && currentSegment === 'auth' ? '/agents' : null;

    if (!redirectTo) {
      return;
    }

    const redirectTimer = setTimeout(() => {
      try {
        router.replace(redirectTo);
      } catch (e) {
        console.error('Navigation error:', e);
      }
    }, 0);

    return () => clearTimeout(redirectTimer);
  }, [hasCheckedAuth, isAuthenticated, isReady, privyReady, segments, walletReady]);

  if (gateState.mode === 'issue') {
    return (
      <View style={styles.loadingContainer}>
        <EaseView
          initialAnimate={getEaseInitialAnimate('card')}
          animate={getEaseAnimate('card')}
          transition={getEaseTransition('card', reducedMotionEnabled)}
          style={styles.issueCard}
        >
          <View style={styles.issueBadge}>
            <Ionicons name="shield-checkmark-outline" size={18} color={BLUE} />
            <Text style={styles.issueBadgeText}>Wallet access</Text>
          </View>
          <Text style={styles.issueTitle}>{gateState.title}</Text>
          <Text style={styles.issueText}>{gateState.message}</Text>
          <View style={styles.issueSteps}>
            <View style={styles.issueStepRow}>
              <View style={styles.issueStepDot} />
              <Text style={styles.issueStepText}>Finish sign-in setup for this build.</Text>
            </View>
            <View style={styles.issueStepRow}>
              <View style={styles.issueStepDot} />
              <Text style={styles.issueStepText}>Reopen the app after those details are ready.</Text>
            </View>
          </View>
          <View style={styles.issueActions}>
            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.buttonPressed,
              ]}
              onPress={() => {
                if (gateState.title === 'Wallet unavailable') {
                  void handleWalletRecovery();
                  return;
                }

                setStartupTimeoutReached(false);
                setHasCheckedAuth(false);
                setRetryKey(prev => prev + 1);
              }}
            >
              <Text style={styles.primaryButtonText}>
                {gateState.title === 'Wallet unavailable' ? 'Sign in again' : 'Try again'}
              </Text>
            </Pressable>
          </View>
        </EaseView>
      </View>
    );
  }

  if (gateState.mode === 'loading') {
    return (
      <View style={styles.loadingContainer}>
        <EaseView
          initialAnimate={getEaseInitialAnimate('screen')}
          animate={getEaseAnimate('screen')}
          transition={getEaseTransition('screen', reducedMotionEnabled)}
          style={styles.loadingBlock}
        >
          <ActivityIndicator size="large" color={BLUE} />
          <Text style={styles.loadingText}>Getting Regents ready...</Text>
        </EaseView>
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
  loadingBlock: {
    alignItems: 'center',
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
  issueBadge: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.BLUE_WASH,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  issueBadgeText: {
    color: BLUE,
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    fontFamily: FONTS.body,
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
  issueSteps: {
    backgroundColor: COLORS.BLUE_WASH,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 18,
    padding: 14,
    gap: 10,
  },
  issueStepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  issueStepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: BLUE,
    marginTop: 7,
  },
  issueStepText: {
    flex: 1,
    color: TEXT_PRIMARY,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONTS.body,
  },
  issueActions: {
    marginTop: 4,
  },
  primaryButton: {
    backgroundColor: BLUE,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: BLUE,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 3,
  },
  primaryButtonText: {
    color: COLORS.WHITE,
    fontSize: 16,
    fontFamily: FONTS.heading,
  },
  buttonPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
});
