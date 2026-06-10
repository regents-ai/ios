import { useEffect, useState } from 'react';

import type { WalletFundingChoice } from '@/types/walletFunding';
import { fetchWalletFundingChoices } from '@/utils/fetchWalletFundingChoices';

export function isBaseUsdcBalance(balance: WalletFundingChoice) {
  return balance.network === 'Base' && balance.token?.symbol?.toUpperCase() === 'USDC';
}

/**
 * Loads the Base USDC funding choice for the agent-funding and default send
 * flows. The cleanup-driven `active` flag guards against the race where a
 * stale in-flight response lands after the inputs change.
 */
export function useFundingChoices({
  isAgentFundingFlow,
  isDefaultSendFlow,
  hasTokenParam,
  network,
  smartAccountAddress,
  setSelectedToken,
  setNetwork,
}: {
  isAgentFundingFlow: boolean;
  isDefaultSendFlow: boolean;
  hasTokenParam: boolean;
  network: string;
  smartAccountAddress: string | null;
  setSelectedToken: (token: WalletFundingChoice | null) => void;
  setNetwork: (network: string) => void;
}) {
  const [loadingFundingBalance, setLoadingFundingBalance] = useState(false);
  const [fundingBalanceError, setFundingBalanceError] = useState<string | null>(null);

  useEffect(() => {
    if ((!isAgentFundingFlow && !isDefaultSendFlow) || hasTokenParam || !smartAccountAddress) {
      return;
    }

    let active = true;
    setLoadingFundingBalance(true);
    setFundingBalanceError(null);

    fetchWalletFundingChoices({ evmAddress: smartAccountAddress })
      .then((choices) => {
        if (!active) {
          return;
        }

        const baseUsdc = choices.find(isBaseUsdcBalance) || null;
        setSelectedToken(baseUsdc);
        setNetwork('base');
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setSelectedToken(null);
        setFundingBalanceError('We could not check your Base USDC balance. Try again in a moment.');
      })
      .finally(() => {
        if (active) {
          setLoadingFundingBalance(false);
        }
      });

    return () => {
      active = false;
    };
    // `network` is a dependency so the cleanup above discards in-flight
    // responses when the network switches, preventing stale balances.
  }, [isAgentFundingFlow, isDefaultSendFlow, hasTokenParam, network, setNetwork, setSelectedToken, smartAccountAddress]);

  return { loadingFundingBalance, fundingBalanceError };
}
