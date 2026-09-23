import { useSendUserOperation } from '@coinbase/cdp-hooks';

import type { ShowTransferAlert } from '@/hooks/wallet/useTransferAlert';
import { buildEvmTransferCall, isNativeEvmToken } from '@/utils/onchain/buildTransferCall';

/**
 * EVM smart-account transfer submission for the send flow.
 *
 * Builds the transfer call and submits the user operation through the CDP
 * smart account (with the paymaster when supported). Status fields are
 * surfaced for the user-op status monitor.
 */
export function useEvmTransfer({
  amount,
  isPaymasterSupported,
  network,
  recipientAddress,
  selectedToken,
  smartAccountAddress,
  showAlert,
}: {
  amount: string;
  isPaymasterSupported: boolean;
  network: string;
  recipientAddress: string;
  selectedToken: any;
  smartAccountAddress: string | null;
  showAlert: ShowTransferAlert;
}) {
  const { sendUserOperation, status: userOpStatus, data: userOpData, error: userOpError } = useSendUserOperation();

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
  };
}
