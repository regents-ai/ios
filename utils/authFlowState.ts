export type AuthGateStateInput = {
  isReady: boolean;
  isPrivyReady: boolean;
  walletReady: boolean;
  hasCheckedAuth: boolean;
  isAuthenticated: boolean;
  testSession: boolean;
  hasAuthError: boolean;
  startupTimeoutReached: boolean;
  walletInitFailureMessage: string | null;
};

export function resolveAuthGateState(input: AuthGateStateInput) {
  const isSettled = input.isReady && input.isPrivyReady && input.walletReady && input.hasCheckedAuth;

  if (isSettled) {
    return { mode: 'ready' as const };
  }

  if (!input.testSession && input.isAuthenticated && input.walletInitFailureMessage) {
    return {
      mode: 'issue' as const,
      title: 'Wallet unavailable',
      message: input.walletInitFailureMessage,
    };
  }

  if (!input.isAuthenticated && !input.testSession && (input.hasAuthError || input.startupTimeoutReached)) {
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
