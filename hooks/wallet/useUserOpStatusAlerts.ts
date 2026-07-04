import { useEffect, useRef, type MutableRefObject } from 'react';

import type { PendingFundingAction } from '@/hooks/wallet/useEvmTransfer';
import type { ShowTransferAlert } from '@/hooks/wallet/useTransferAlert';
import { finishPendingRun, startPendingRun } from '@/utils/liveActivityBridge';
import { formatAddressPreview, getEvmExplorerUrl, getNetworkLabel } from '@/utils/onchain/networkDisplay';
import { regentApi } from '@/utils/regentApi/client';

/**
 * Watches user-operation status transitions and raises the pending / success
 * / failure alerts for the send flow, confirming tracked agent-funding wallet
 * actions on success.
 *
 * The once-per-transition ref ensures each alert fires exactly once per
 * status transition even though the effect also depends on alert-copy values
 * (amount, recipient, ...) that change independently.
 */
export function useUserOpStatusAlerts({
  amount,
  isAgentFundingFlow,
  isDefaultSendFlow,
  network,
  pendingFundingActionRef,
  recipientAddress,
  recipientLabel,
  selectedToken,
  smartAccountAddress,
  userOpStatus,
  userOpData,
  userOpError,
  showAlert,
}: {
  amount: string;
  isAgentFundingFlow: boolean;
  isDefaultSendFlow: boolean;
  network: string;
  pendingFundingActionRef: MutableRefObject<PendingFundingAction | null>;
  recipientAddress: string;
  recipientLabel: string | null;
  selectedToken: any;
  smartAccountAddress: string | null;
  userOpStatus: string;
  userOpData: { userOpHash?: string; transactionHash?: string } | null | undefined;
  userOpError: Error | null | undefined;
  showAlert: ShowTransferAlert;
}) {
  // Tracks the last user-operation status transition we alerted on, so the
  // status effect fires each alert exactly once per transition.
  const lastHandledUserOpRef = useRef<string | null>(null);

  // Pending-run id mirrored to the Live Activity model for this submission,
  // so success / error can end the same run even if userOpData is gone.
  const liveActivityRunIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Only react to actual status transitions. The deps below include values
    // used for alert copy (amount, recipient, ...) that change independently;
    // without this guard the same alert would re-fire on unrelated updates.
    const transitionKey = `${userOpStatus}:${userOpData?.userOpHash ?? ''}`;
    if (lastHandledUserOpRef.current === transitionKey) {
      return;
    }
    lastHandledUserOpRef.current = transitionKey;

    if (userOpStatus === 'pending' && userOpData?.userOpHash) {
      // Display-only: track the pending send in the Live Activity model. The
      // bridge only ever surfaces the redacted projection (…last-4 hint +
      // coarse amount bucket) outside the app.
      liveActivityRunIdRef.current = userOpData.userOpHash;
      startPendingRun({
        id: userOpData.userOpHash,
        kind: 'send',
        counterpartyAddress: recipientAddress,
        rawAmount: amount,
        currency: selectedToken?.token?.symbol,
      });
      showAlert(
        isAgentFundingFlow || isDefaultSendFlow ? 'Sending payment' : 'Sending funds',
        isAgentFundingFlow
          ? 'Your agent payment is on the way. This can take a few moments.'
          : isDefaultSendFlow
            ? 'Your payment is on the way. This can take a few moments.'
          : 'Your transfer is on the way. This can take a few moments.',
        'info',
        undefined,
        true
      );
    } else if (userOpStatus === 'success' && userOpData) {
      if (liveActivityRunIdRef.current) {
        finishPendingRun(liveActivityRunIdRef.current, 'settled');
        liveActivityRunIdRef.current = null;
      }
      const txHash = userOpData.transactionHash || userOpData.userOpHash || '';
      const explorerUrl = getEvmExplorerUrl(network, txHash);

      if (isAgentFundingFlow) {
        const pendingAction = pendingFundingActionRef.current;
        if (pendingAction && pendingAction.txHash !== txHash) {
          pendingAction.txHash = txHash;
          void (async () => {
            try {
              await regentApi.confirmWalletAction({
                actionId: pendingAction.actionId,
                txHash,
                chainId: 8453,
              });

              const successInfo = [
                `You sent ${amount} ${selectedToken?.token?.symbol || 'USDC'} to ${recipientLabel || 'this agent'}.`,
                '',
                `Network: ${getNetworkLabel(network)}`,
                `Agent wallet: ${formatAddressPreview(recipientAddress)}`,
              ].join('\n');

              showAlert('Payment complete', successInfo, 'success', explorerUrl);
            } catch {
              const successInfo = [
                `You sent ${amount} ${selectedToken?.token?.symbol || 'USDC'} to ${recipientLabel || 'this agent'}.`,
                '',
                'The payment is on its way. The receipt may take a moment to update.',
              ].join('\n');

              showAlert('Payment sent', successInfo, 'success', explorerUrl);
            }
          })();
          return;
        }

        const successInfo = [
          `You sent ${amount} ${selectedToken?.token?.symbol || 'USDC'} to ${recipientLabel || 'this agent'}.`,
          '',
          `Network: ${getNetworkLabel(network)}`,
          `Agent wallet: ${formatAddressPreview(recipientAddress)}`,
        ].join('\n');

        showAlert('Payment complete', successInfo, 'success', explorerUrl);
        return;
      }

      const successInfo = [
        `You sent ${amount} ${selectedToken?.token?.symbol || ''}.`,
        '',
        `Network: ${getNetworkLabel(network)}`,
        `From: ${smartAccountAddress?.slice(0, 6)}...${smartAccountAddress?.slice(-4)}`,
        `To: ${formatAddressPreview(recipientAddress)}`,
      ].join('\n');

      showAlert(
        isDefaultSendFlow ? 'Payment complete' : 'Send complete',
        successInfo,
        'success',
        explorerUrl
      );
    } else if (userOpStatus === 'error' && userOpError) {
      if (liveActivityRunIdRef.current) {
        finishPendingRun(liveActivityRunIdRef.current, 'failed');
        liveActivityRunIdRef.current = null;
      }
      showAlert(
        'Send failed',
        userOpError.message || 'Please try again.',
        'error'
      );
    }
  }, [amount, isAgentFundingFlow, isDefaultSendFlow, network, pendingFundingActionRef, recipientAddress, recipientLabel, selectedToken?.token?.symbol, showAlert, smartAccountAddress, userOpStatus, userOpData, userOpError]);

  // Clears transition tracking before a new submission so the next pending /
  // success / error sequence alerts again.
  const resetUserOpTracking = () => {
    lastHandledUserOpRef.current = null;
  };

  return { resetUserOpTracking };
}
