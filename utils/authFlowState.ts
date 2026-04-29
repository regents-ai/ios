export type AuthGateStateInput = {
  isReady: boolean;
  isPrivyReady: boolean;
  walletReady: boolean;
  hasCheckedAuth: boolean;
  isAuthenticated: boolean;
  hasAuthError: boolean;
  startupTimeoutReached: boolean;
  walletInitFailureMessage: string | null;
};

const PUBLIC_ROUTES = new Set(['email-verify', 'email-code', 'phone-verify', 'phone-code']);

export function resolveAuthGateState(input: AuthGateStateInput) {
  const isSettled = input.isReady && input.isPrivyReady && input.walletReady && input.hasCheckedAuth;

  if (isSettled) {
    return { mode: 'ready' as const };
  }

  if (input.isAuthenticated && input.walletInitFailureMessage) {
    return {
      mode: 'issue' as const,
      title: 'Wallet unavailable',
      message: input.walletInitFailureMessage,
    };
  }

  if (!input.isAuthenticated && (input.hasAuthError || input.startupTimeoutReached)) {
    return {
      mode: 'issue' as const,
      title: 'Sign-in is unavailable',
      message: 'This build cannot open the wallet right now. Finish setup, then try again.',
    };
  }

  return { mode: 'loading' as const };
}

export function getVerificationSuccessAction(mode: 'signin' | 'link' | 'reverify') {
  return mode === 'signin' ? 'go_wallet' : 'dismiss';
}

export function isAuthManagedRoute(segment?: string) {
  return segment === 'auth' || PUBLIC_ROUTES.has(segment || '');
}
