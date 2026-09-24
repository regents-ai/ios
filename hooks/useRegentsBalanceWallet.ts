import { useCurrentUser } from '@coinbase/cdp-hooks';
import { useMemo } from 'react';

import { useRegentsAuth } from '@/hooks/useRegentsAuth';
import { regentsBalanceWallet } from '@/utils/home/homeSummary';

/** The address that holds the person's Regents Balance, or null when none is set up. */
export function useRegentsBalanceWallet(): string | null {
  const { privyUser } = useRegentsAuth();
  const { currentUser } = useCurrentUser();
  const phoneWallet = (currentUser?.evmSmartAccounts?.[0] as string | undefined) ?? null;
  const linkedAccounts = privyUser?.linked_accounts;

  return useMemo(() => regentsBalanceWallet(linkedAccounts ?? [], phoneWallet), [linkedAccounts, phoneWallet]);
}
