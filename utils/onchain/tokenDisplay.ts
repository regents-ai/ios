type TokenChoiceLike = {
  amount?: {
    amount?: string | number;
    decimals?: string | number;
  } | null;
  usdValue?: number;
} | null;

export function parseTokenDecimals(value: unknown): number | null {
  const decimals =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : NaN;

  return Number.isInteger(decimals) && decimals >= 0 ? decimals : null;
}

export function getTokenBalance(selectedToken: TokenChoiceLike): string | null {
  if (!selectedToken?.amount) return '0';

  const decimals = parseTokenDecimals(selectedToken.amount.decimals);
  const rawAmount = Number(selectedToken.amount.amount || '0');

  if (decimals === null || !Number.isFinite(rawAmount)) return null;

  const actualBalance = rawAmount / Math.pow(10, decimals);

  return actualBalance.toLocaleString(undefined, {
    maximumFractionDigits: actualBalance >= 1 ? 4 : 6,
  });
}

export function getUsdEstimate(selectedToken: TokenChoiceLike, amount: string): string | null {
  if (!selectedToken?.usdValue || !selectedToken?.amount || !amount) return null;

  const decimals = parseTokenDecimals(selectedToken.amount.decimals);
  const rawAmount = Number(selectedToken.amount.amount || '0');

  if (decimals === null || !Number.isFinite(rawAmount) || !Number.isFinite(selectedToken.usdValue)) {
    return null;
  }

  const tokenBalance = rawAmount / Math.pow(10, decimals);
  const pricePerToken = tokenBalance > 0 ? selectedToken.usdValue / tokenBalance : 0;

  if (!Number.isFinite(pricePerToken)) return null;

  const estimate = parseFloat(amount) * pricePerToken;

  if (!Number.isFinite(estimate)) return null;

  return estimate.toFixed(2);
}

/**
 * A decimal token amount for reading: at most four decimal places, cut (never
 * rounded up) and without trailing zeros. A missing amount reads as zero.
 */
export function displayTokenAmount(value?: string | null) {
  if (!value) {
    return '0';
  }

  const [whole, decimal] = value.split('.');
  if (!decimal) {
    return whole;
  }

  return `${whole}.${decimal.slice(0, 4)}`.replace(/\.?0+$/, '');
}
