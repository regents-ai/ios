import { useSendUserOperation } from '@coinbase/cdp-hooks';
import * as Crypto from 'expo-crypto';
import { useRef } from 'react';

import type { ShowTransferAlert } from '@/hooks/wallet/useTransferAlert';
import { buildEvmTransferCall, isNativeEvmToken } from '@/utils/onchain/buildTransferCall';
import { buildFundingIdempotencyKey } from '@/utils/onchain/fundingIdempotency';
import { regentApi } from '@/utils/regentApi/client';

export type PendingFundingAction = { actionId: string; txHash?: string };

/**
 * EVM smart-account transfer submission for the send flow.
 *
 * Builds the transfer call, records tracked agent-funding wallet actions with
 * the Regents API before money moves, and submits the user operation through
 * the CDP smart account (with the paymaster when supported). Status fields
 * are surfaced for the user-op status monitor.
 */
export function useEvmTransfer({
  amount,
  isAgentFundingFlow,
  isPaymasterSupported,
  network,
  recipientAddress,
  recipientLabel,
  regentId,
  selectedToken,
  smartAccountAddress,
  tokenSymbol,
  showAlert,
}: {
  amount: string;
  isAgentFundingFlow: boolean;
  isPaymasterSupported: boolean;
  network: string;
  recipientAddress: string;
  recipientLabel: string | null;
  regentId: string | null;
  selectedToken: any;
  smartAccountAddress: string | null;
  tokenSymbol: string;
  showAlert: ShowTransferAlert;
}) {
  const { sendUserOperation, status: userOpStatus, data: userOpData, error: userOpError } = useSendUserOperation();
  const pendingFundingActionRef = useRef<PendingFundingAction | null>(null);

  const sendEvmTransfer = async () => {
    if (!selectedToken) return;

    if (!smartAccountAddress) {
      showAlert('Wallet not ready', 'Your wallet is still getting ready. Try again in a moment.', 'error');
      return;
    }

    const tokenAddress = selectedToken.token?.contractAddress;
    const isNativeTransfer = isNativeEvmToken(tokenAddress);
    const call = buildEvmTransferCall({
      recipientAddress,
      amountDecimal: amount,
      tokenAddress,
      decimals: isNativeTransfer ? undefined : parseInt(selectedToken.amount?.decimals || '0', 10),
    });

    try {
      if (isAgentFundingFlow) {
        if (!regentId) {
          throw new Error('Choose an agent before sending funds.');
        }

        if (network !== 'base' || tokenSymbol !== 'USDC' || isNativeTransfer) {
          throw new Error('Add USDC on Base first, then fund this agent.');
        }

        const preparedAction = await regentApi.prepareWalletAction({
          type: 'funding',
          regentId,
          expectedSigner: smartAccountAddress,
          to: call.to,
          value: call.value.toString(),
          data: call.data,
          amount,
          currency: tokenSymbol,
          riskCopy: `You are sending ${amount} ${tokenSymbol} to ${recipientLabel || 'this agent'}.`,
          idempotencyKey: buildFundingIdempotencyKey({
            amount,
            expectedSigner: smartAccountAddress,
            recipientAddress,
            regentId,
            tokenAddress,
            nonce: Crypto.randomUUID(),
          }),
        });
        pendingFundingActionRef.current = { actionId: preparedAction.action_id };
      }

      await sendUserOperation({
        evmSmartAccount: smartAccountAddress as `0x${string}`,
        network: network as any,
        calls: [call],
        useCdpPaymaster: isPaymasterSupported,
      });
    } catch (error) {
      console.error('EVM transfer error:', error);
      throw error;
    }
  };

  return {
    sendEvmTransfer,
    userOpStatus,
    userOpData,
    userOpError,
    pendingFundingActionRef,
  };
}
