import type { User as PrivyUser } from '@privy-io/api-types';
import { usePrivy } from '@privy-io/expo';

function findLinkedEmail(user: PrivyUser | null): string | null {
  const emailAccount = user?.linked_accounts.find(account => account.type === 'email');
  return emailAccount && 'address' in emailAccount ? emailAccount.address : null;
}

function findLinkedPhone(user: PrivyUser | null): string | null {
  const phoneAccount = user?.linked_accounts.find(account => account.type === 'phone');
  if (!phoneAccount || !('phoneNumber' in phoneAccount)) {
    return null;
  }
  return phoneAccount.phoneNumber ?? phoneAccount.number ?? null;
}

export function useRegentsAuth() {
  const { user, isReady, error, getAccessToken, logout } = usePrivy();

  return {
    privyUser: user,
    regentsUserId: user?.id ?? null,
    linkedEmail: findLinkedEmail(user),
    linkedPhone: findLinkedPhone(user),
    isReady,
    error,
    isAuthenticated: !!user,
    getAccessToken,
    signOut: logout,
  };
}
