import { useEffect } from 'react';

import {
  activateLocalTestSession,
  getTestWalletEvm,
  getTestWalletSol,
  hydrateTestSession,
  isLocalTestSessionEnabled,
  isTestSessionActive,
} from '@/utils/state/reviewSessionState';
import { hydrateSandboxMode } from '@/utils/state/sandboxState';
import { hydrateLifetimeTransactionThreshold, hydrateVerifiedPhone } from '@/utils/state/verificationState';
import { setCurrentSolanaAddress, setCurrentWalletAddress } from '@/utils/state/walletRuntimeState';

function primeReviewWalletState() {
  if (!isTestSessionActive()) {
    return;
  }

  setCurrentWalletAddress(getTestWalletEvm());
  setCurrentSolanaAddress(getTestWalletSol());
}

export function useAppBootstrap() {
  const localTestSessionEnabled = isLocalTestSessionEnabled();

  useEffect(() => {
    if (localTestSessionEnabled && !isTestSessionActive()) {
      activateLocalTestSession();
    }

    primeReviewWalletState();
  }, [localTestSessionEnabled]);

  useEffect(() => {
    const hydrate = async () => {
      await Promise.all([
        hydrateSandboxMode(),
        hydrateVerifiedPhone(),
        hydrateLifetimeTransactionThreshold(),
        hydrateTestSession(),
      ]);

      if (localTestSessionEnabled || isTestSessionActive()) {
        primeReviewWalletState();
      }
    };

    hydrate().catch(() => {});
  }, [localTestSessionEnabled]);

  return {
    localTestSessionEnabled,
  };
}
