/**
 * Auth Initializer Component
 *
 * Initializes:
 * - Global access token getter for API calls
 * - Push notification registration
 *
 * Must be placed inside CDPHooksProvider to access useGetAccessToken.
 *
 * Usage:
 * <CDPHooksProvider>
 *   <AuthInitializer>
 *     <YourApp />
 *   </AuthInitializer>
 * </CDPHooksProvider>
 */

import { useAuthenticateWithJWT, useCurrentUser, useIsSignedIn } from '@coinbase/cdp-hooks';
import { useRegentsAuth } from '@/hooks/useRegentsAuth';
import { clearWalletInitFailureMessage, setWalletInitFailureMessage } from '@/utils/authStartupState';
import { initializeAccessTokenGetter } from '@/utils/getAccessTokenGlobal';
import { isTestSessionActive } from '@/utils/sharedState';
import { configureNotificationHandling, registerForPushNotifications, sendPushTokenToServer } from '@/utils/pushNotifications';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

export function AuthInitializer({ children }: { children: React.ReactNode }) {
  const { authenticateWithJWT } = useAuthenticateWithJWT();
  const { isSignedIn } = useIsSignedIn();
  const { getAccessToken, isAuthenticated, isReady, regentsUserId } = useRegentsAuth();
  const { currentUser } = useCurrentUser();
  const isAuthenticatingWallet = useRef(false);

  useEffect(() => {
    initializeAccessTokenGetter(getAccessToken);
  }, [getAccessToken]);

  useEffect(() => {
    if (Platform.OS === 'web') {
      clearWalletInitFailureMessage();
      return;
    }

    if (isTestSessionActive()) {
      clearWalletInitFailureMessage();
      return;
    }

    if (!isReady || !isAuthenticated || isSignedIn || isAuthenticatingWallet.current) {
      if (!isAuthenticated || isSignedIn) {
        clearWalletInitFailureMessage();
      }
      return;
    }

    isAuthenticatingWallet.current = true;
    authenticateWithJWT()
      .then(() => {
        clearWalletInitFailureMessage();
      })
      .catch((error) => {
        console.error('❌ [APP] Failed to connect wallet session:', error);
        setWalletInitFailureMessage('We could not finish opening your wallet. Please sign in again.');
      })
      .finally(() => {
        isAuthenticatingWallet.current = false;
      });
  }, [authenticateWithJWT, isAuthenticated, isReady, isSignedIn]);

  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }

    configureNotificationHandling().catch((error) => {
      console.error('❌ [APP] Failed to configure notification handling:', error);
    });
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }

    if (regentsUserId && currentUser?.userId) {
      const partnerUserRef = regentsUserId;

      registerForPushNotifications().then(async (result) => {
        if (result) {
          await sendPushTokenToServer(result.token, partnerUserRef, getAccessToken, result.type);
        }
      }).catch((error) => {
        console.error('❌ [APP] Failed to register push notifications:', error);
      });
    }
  }, [currentUser?.userId, getAccessToken, regentsUserId]);

  return <>{children}</>;
}
