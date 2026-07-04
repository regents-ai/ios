import { useEffect } from 'react';

import { hydrateLiveActivityRuns } from '@/utils/liveActivityBridge';
import { hydrateLifetimeTransactionThreshold, hydrateVerifiedPhone } from '@/utils/state/verificationState';

export function useAppBootstrap() {
  useEffect(() => {
    const hydrate = async () => {
      await Promise.all([
        hydrateVerifiedPhone(),
        hydrateLifetimeTransactionThreshold(),
        // Rehydrates persisted pending runs and reconciles orphans: runs with
        // no live source go stale, and any leftover lock-screen activity with
        // no matching run is ended.
        hydrateLiveActivityRuns(),
      ]);
    };

    hydrate().catch(() => {});
  }, []);

  return {};
}
