/**
 * Auth Gate - Enforces authentication before app access
 *
 * Wraps the entire app to ensure users are logged in.
 * Shows loading spinner while checking auth status.
 * Redirects to login screen if not authenticated.
 *
 */

import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { clearWalletInitFailureMessage, getWalletInitFailureMessage } from '@/utils/authStartupState';
import { isAuthManagedRoute, resolveAuthGateState } from '@/utils/authFlowState';
import { useChatGptAuth } from '@/hooks/useChatGptAuth';
import { useRegentsAuth } from '@/hooks/useRegentsAuth';
import { getMotionPreset } from '@/components/motion/easePresets';
import { useReducedMotion } from '@/components/motion/useReducedMotion';
import { setCountry, setSubdivision } from '@/utils/state/locationState';
import { setCurrentSolanaAddress, setCurrentWalletAddress } from '@/utils/state/walletRuntimeState';
import { useIsInitialized, useSignOut } from '@coinbase/cdp-hooks';
import { router, useRootNavigationState, useSegments } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EaseView } from 'react-native-ease';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const reducedMotionEnabled = useReducedMotion();
  const { isInitialized } = useIsInitialized();
  const { error: authError, isAuthenticated: isPrivyAuthenticated, isReady: isPrivyReady, signOut: signOutIdentity } = useRegentsAuth();
  const { isReady: isChatGptReady, session: chatGptSession, signOut: signOutChatGpt } = useChatGptAuth();
  const { signOut: signOutWallet } = useSignOut();
  const segments = useSegments();
  const navigationState = useRootNavigationState();
  const [isReady, setIsReady] = useState(false);
  const [hasCheckedAuth, setHasCheckedAuth] = useState(false);
  const [startupTimeoutReached, setStartupTimeoutReached] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const isAuthenticated = !!chatGptSession && isPrivyAuthenticated;
  const requiresWalletInitialization = !!chatGptSession && isPrivyAuthenticated;
  const walletReady = !requiresWalletInitialization || isInitialized;
  const gateState = resolveAuthGateState({
    isReady,
    isPrivyReady: isPrivyReady && isChatGptReady,
    walletReady,
    hasCheckedAuth,
    isAuthenticated,
    hasAuthError: !!authError,
    startupTimeoutReached,
    walletInitFailureMessage: getWalletInitFailureMessage(),
  });

  const handleWalletRecovery = useCallback(async () => {
    try {
      clearWalletInitFailureMessage();
      await signOutChatGpt();
      await signOutIdentity();
      await signOutWallet();
    } catch (error) {
      console.error('Sign out failed:', error);
    } finally {
      setCurrentWalletAddress(null);
      setCurrentSolanaAddress(null);
      setCountry('US');
      setSubdivision('CA');
      setStartupTimeoutReached(false);
      setHasCheckedAuth(false);
      setRetryKey(prev => prev + 1);
      router.replace('/auth/login');
    }
  }, [signOutChatGpt, signOutIdentity, signOutWallet]);

  useEffect(() => {
    if (navigationState?.key) {
      setIsReady(true);
    }
  }, [navigationState?.key]);

  useEffect(() => {
    if (isPrivyReady && isChatGptReady && walletReady) {
      const timer = setTimeout(() => {
        setHasCheckedAuth(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isChatGptReady, isPrivyReady, walletReady]);

  useEffect(() => {
    if (isAuthenticated || (isPrivyReady && isChatGptReady)) {
      setStartupTimeoutReached(false);
      return;
    }

    const timer = setTimeout(() => {
      setStartupTimeoutReached(true);
    }, 4000);

    return () => clearTimeout(timer);
  }, [isAuthenticated, isChatGptReady, isPrivyReady, retryKey]);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    if (!isPrivyReady || !isChatGptReady || !walletReady) {
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
  }, [hasCheckedAuth, isAuthenticated, isChatGptReady, isPrivyReady, isReady, segments, walletReady]);

  if (gateState.mode === 'issue') {
    return (
      <View style={styles.loadingContainer}>
        <EaseView {...getMotionPreset('card', reducedMotionEnabled)} style={styles.issueCard}>
          <View style={styles.issueBadge}>
            <Ionicons name="shield-checkmark-outline" size={18} color={colors.accent} />
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
        <EaseView {...getMotionPreset('screen', reducedMotionEnabled)} style={styles.loadingBlock}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Getting Regents ready...</Text>
        </EaseView>
      </View>
    );
  }

  return <>{children}</>;
}

function makeStyles({ colors, fonts }: Theme) {
  return StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.bg,
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
    color: colors.textMuted,
    fontFamily: fonts.ui,
  },
  issueCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    borderRadius: 24,
    padding: 24,
    gap: 12,
    shadowColor: colors.accent,
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
    backgroundColor: colors.accentWash,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  issueBadgeText: {
    color: colors.accent,
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    fontFamily: fonts.ui,
  },
  issueTitle: {
    color: colors.text,
    fontSize: 24,
    textAlign: 'center',
    fontFamily: fonts.title,
  },
  issueText: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    fontFamily: fonts.ui,
  },
  issueSteps: {
    backgroundColor: colors.accentWash,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
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
    backgroundColor: colors.accent,
    marginTop: 7,
  },
  issueStepText: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.ui,
  },
  issueActions: {
    marginTop: 4,
  },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 3,
  },
  primaryButtonText: {
    color: colors.onAccent,
    fontSize: 16,
    fontFamily: fonts.title,
  },
  buttonPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
  });
}
