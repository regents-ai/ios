import { useCallback, useEffect, useState } from 'react';

import {
  getTestWalletEvm,
  getTestWalletSol,
} from '@/utils/state/reviewSessionState';
import {
  getCurrentWalletAddress,
  getWalletAddressForNetwork,
  setCurrentSolanaAddress,
  setCurrentWalletAddress,
  subscribeWalletRuntime,
} from '@/utils/state/walletRuntimeState';

type WalletAddressSyncParams = {
  currentUser: any;
  effectiveIsSignedIn: boolean;
  evmAddress?: string | null;
  solanaAddress?: string | null;
  testSession: boolean;
};

export function useWalletAddresses({
  currentUser,
  effectiveIsSignedIn,
  evmAddress,
  solanaAddress,
  testSession,
}: WalletAddressSyncParams) {
  const [address, setAddress] = useState('');

  const syncSelectedAddress = useCallback(() => {
    setAddress(getCurrentWalletAddress() ?? '');
  }, []);

  useEffect(() => {
    if (!effectiveIsSignedIn) {
      setAddress('');
      return;
    }

    if (testSession) {
      setCurrentWalletAddress(getTestWalletEvm());
      setCurrentSolanaAddress(getTestWalletSol());
      syncSelectedAddress();
      return;
    }

    const evmSmartAccount = currentUser?.evmSmartAccounts?.[0] as string | undefined;
    const evmOwnedAccount = (currentUser?.evmAccounts?.[0] as string | undefined) || evmAddress || undefined;
    const solOwnedAccount = (currentUser?.solanaAccounts?.[0] as string | undefined) || solanaAddress || undefined;
    const primaryEvmAddress = evmSmartAccount || evmOwnedAccount || null;

    if (primaryEvmAddress) {
      setCurrentWalletAddress(primaryEvmAddress);
    }
    if (solOwnedAccount) {
      setCurrentSolanaAddress(solOwnedAccount);
    }

    syncSelectedAddress();
  }, [currentUser, effectiveIsSignedIn, evmAddress, solanaAddress, syncSelectedAddress, testSession]);

  useEffect(() => {
    return subscribeWalletRuntime(() => {
      syncSelectedAddress();
    });
  }, [syncSelectedAddress]);

  const handleNetworkChange = useCallback(
    (network: string) => {
      setAddress(getWalletAddressForNetwork(network) ?? '');
    },
    []
  );

  return {
    address,
    setAddress,
    syncSelectedAddress,
    onNetworkChange: handleNetworkChange,
  };
}
