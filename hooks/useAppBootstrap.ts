import { useEffect } from 'react';

import { hydrateLifetimeTransactionThreshold, hydrateVerifiedPhone } from '@/utils/state/verificationState';

export function useAppBootstrap() {
  useEffect(() => {
    const hydrate = async () => {
      await Promise.all([
        hydrateVerifiedPhone(),
        hydrateLifetimeTransactionThreshold(),
      ]);
    };

    hydrate().catch(() => {});
  }, []);

  return {};
}
