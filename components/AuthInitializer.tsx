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
import { configureNotificationHandling, registerForPushNotifications, sendPushTokenToServer } from '@/utils/pushNotifications';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

async function registerUserPushToken(
  partnerUserRef: string,
  getAccessToken: () => Promise<string | null>
) {
  const result = await registerForPushNotifications();
  if (!result) {
    return;
  }

  await sendPushTokenToServer(result.token, partnerUserRef, getAccessToken, result.type);
}

export function AuthInitializer({ children }: { children: React.ReactNode }) {
  const { authenticateWithJWT } = useAuthenticateWithJWT();
  const { isSignedIn } = useIsSignedIn();
  const { getAccessToken, isAuthenticated, isReady, regentsUserId } = useRegentsAuth();
  const { currentUser } = useCurrentUser();
  const isAuthenticatingWallet = useRef(false);
  const isWeb = Platform.OS === 'web';

  useEffect(() => {
    initializeAccessTokenGetter(getAccessToken);
  }, [getAccessToken]);

  useEffect(() => {
    if (isWeb) {
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
  }, [authenticateWithJWT, isAuthenticated, isReady, isSignedIn, isWeb]);

  useEffect(() => {
    if (isWeb) {
      return;
    }

    configureNotificationHandling().catch((error) => {
      console.error('❌ [APP] Failed to configure notification handling:', error);
    });
  }, [isWeb]);

  useEffect(() => {
    if (isWeb) {
      return;
    }

    if (!regentsUserId || !currentUser?.userId) {
      return;
    }

    registerUserPushToken(regentsUserId, getAccessToken).catch((error) => {
      console.error('❌ [APP] Failed to register push notifications:', error);
    });
  }, [currentUser?.userId, getAccessToken, isWeb, regentsUserId]);

  return <>{children}</>;
}
