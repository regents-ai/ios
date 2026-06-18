import { isSolanaNetwork } from './networkDisplay';
import { getTokenBalance, parseTokenDecimals } from './tokenDisplay';

type SendTokenLike = {
  amount?: {
    amount?: string | number;
    decimals?: string | number;
  } | null;
  token?: {
    symbol?: string;
  } | null;
} | null;

function getAvailableTokenBalance(selectedToken: SendTokenLike): number | null {
  if (!selectedToken?.amount) return 0;

  const decimals = parseTokenDecimals(selectedToken.amount.decimals);
  const rawAmount = Number(selectedToken.amount.amount || '0');

  if (decimals === null || !Number.isFinite(rawAmount)) return null;

  return rawAmount / Math.pow(10, decimals);
}

/**
 * Friendly error when the entered amount exceeds the available balance.
 * Returns null when the amount fits, or when the balance is genuinely
 * unknown (invalid decimals or amount data) and there is nothing to check
 * against.
 */
export function getInsufficientBalanceError(selectedToken: SendTokenLike, amount: string): string | null {
  const balance = getAvailableTokenBalance(selectedToken);
  if (balance === null) return null;

  if (parseFloat(amount) <= balance) return null;

  const balanceDisplay = getTokenBalance(selectedToken);
  const symbol = selectedToken?.token?.symbol?.toUpperCase() || 'USDC';

  return `You can send up to ${balanceDisplay} ${symbol}.`;
}

/**
 * Friendly error when the resolved recipient is the sender's own wallet.
 * EVM addresses compare case-insensitively; Solana addresses are
 * case-sensitive base58 and compare exactly.
 */
export function getSelfSendError({
  network,
  recipientAddress,
  smartAccountAddress,
  solanaAddress,
}: {
  network: string;
  recipientAddress: string;
  smartAccountAddress: string | null;
  solanaAddress: string | null;
}): string | null {
  const isSelf = isSolanaNetwork(network)
    ? !!solanaAddress && recipientAddress === solanaAddress
    : !!smartAccountAddress && recipientAddress.toLowerCase() === smartAccountAddress.toLowerCase();

  return isSelf ? 'This is your own wallet address. Enter a different recipient.' : null;
}
