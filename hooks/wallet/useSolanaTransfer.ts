import { useSendSolanaTransaction } from '@coinbase/cdp-hooks';

import type { ShowTransferAlert } from '@/hooks/wallet/useTransferAlert';
import { buildSolanaTransferTransaction } from '@/utils/onchain/buildSolanaTransfer';
import { parseSolanaAmountToBaseUnits } from '@/utils/onchain/solanaAmount';

/**
 * Solana transfer submission for the send flow: parses the amount, builds the
 * native or SPL transaction, signs and sends it through the CDP wallet, and
 * raises the pending / success alerts.
 */
export function useSolanaTransfer({
  amount,
  network,
  recipientAddress,
  selectedToken,
  solanaAddress,
  showAlert,
}: {
  amount: string;
  network: string;
  recipientAddress: string;
  selectedToken: any;
  solanaAddress: string | null;
  showAlert: ShowTransferAlert;
}) {
  const { sendSolanaTransaction } = useSendSolanaTransaction();

  const sendSolanaTransfer = async () => {
    if (!solanaAddress || !selectedToken) return;

    try {
      const tokenSymbol = selectedToken.token?.symbol?.toUpperCase() || 'SOL';
      const isSPLToken = selectedToken.token?.mintAddress && tokenSymbol !== 'SOL';
      const tokenDecimals = selectedToken.amount?.decimals;
      const decimals = isSPLToken
        ? (typeof tokenDecimals === 'string' && /^\d+$/.test(tokenDecimals) ? Number.parseInt(tokenDecimals, 10) : NaN)
        : 9;
      const amountRaw = parseSolanaAmountToBaseUnits(amount, decimals);
      const isDevnet = network?.toLowerCase().includes('devnet');
      showAlert(
        'Sending funds',
        `Sending ${amount} ${tokenSymbol}. This can take a few moments.`,
        'info',
        undefined,
        true
      );

      const { Connection, clusterApiUrl } = await import('@solana/web3.js');
      const cluster = isDevnet ? 'devnet' : 'mainnet-beta';
      const connection = new Connection(clusterApiUrl(cluster));

      const transaction = await buildSolanaTransferTransaction({
        connection,
        fromAddress: solanaAddress,
        recipientAddress,
        amountRaw,
        mintAddress: isSPLToken ? selectedToken.token.mintAddress : null,
        tokenSymbol,
        isDevnet,
      });

      const serializedTransaction = transaction.serialize({
        requireAllSignatures: false,
        verifySignatures: false
      }).toString('base64');
      const cdpNetwork = isDevnet ? 'solana-devnet' : 'solana';

      const result = await sendSolanaTransaction({
        solanaAccount: solanaAddress,
        network: cdpNetwork as any,
        transaction: serializedTransaction
      });

      const explorerUrl = isDevnet
        ? `https://explorer.solana.com/tx/${result.transactionSignature}?cluster=devnet`
        : `https://solscan.io/tx/${result.transactionSignature}`;

      const successInfo = [
        `You sent ${amount} ${tokenSymbol}.`,
        '',
        `Network: Solana ${isDevnet ? 'test network' : 'mainnet'}`,
        `From: ${solanaAddress.slice(0, 6)}...${solanaAddress.slice(-4)}`,
        `To: ${recipientAddress.slice(0, 6)}...${recipientAddress.slice(-4)}`,
      ].join('\n');

      showAlert(
        'Send complete',
        successInfo,
        'success',
        explorerUrl
      );
    } catch (error) {
      console.error('Solana transfer error:', error);
      throw error;
    }
  };

  return { sendSolanaTransfer };
}
