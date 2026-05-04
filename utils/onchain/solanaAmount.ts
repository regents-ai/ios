const MAX_SOLANA_BASE_UNITS = 18_446_744_073_709_551_615n;

export function parseSolanaAmountToBaseUnits(amount: string, decimals: number): bigint {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new Error('This token amount cannot be sent right now.');
  }

  const trimmed = amount.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error('Enter a valid amount.');
  }

  const [whole, fractional = ''] = trimmed.split('.');
  if (fractional.length > decimals) {
    throw new Error(`Enter no more than ${decimals} decimal places.`);
  }

  const scale = 10n ** BigInt(decimals);
  const wholeUnits = BigInt(whole) * scale;
  const fractionalUnits = fractional ? BigInt(fractional.padEnd(decimals, '0')) : 0n;
  const baseUnits = wholeUnits + fractionalUnits;

  if (baseUnits <= 0n) {
    throw new Error('Enter an amount greater than zero.');
  }

  if (baseUnits > MAX_SOLANA_BASE_UNITS) {
    throw new Error('Enter a smaller amount.');
  }

  return baseUnits;
}
