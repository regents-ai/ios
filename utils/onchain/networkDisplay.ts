/**
 * Network display helpers shared across the send flow.
 */

export function getNetworkLabel(network: string) {
  const networkLower = network?.toLowerCase() || '';

  if (networkLower === 'base') return 'Base';
  if (networkLower === 'base-sepolia') return 'Base test network';
  if (networkLower === 'ethereum') return 'Ethereum';
  if (networkLower === 'ethereum-sepolia') return 'Ethereum test network';
  if (networkLower.includes('solana') && networkLower.includes('devnet')) return 'Solana test network';
  if (networkLower.includes('solana')) return 'Solana';

  return network.charAt(0).toUpperCase() + network.slice(1);
}

export function formatAddressPreview(address?: string | null) {
  if (!address) return 'Not ready';
  if (address.length <= 14) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function isSolanaNetwork(network: string) {
  return network?.toLowerCase().includes('solana');
}

/**
 * Maps an EVM network to the explorer link for a transaction hash. Falls back
 * to a plain "Transaction Hash: ..." string for networks without a mapping,
 * which the alert layer treats as non-linkable.
 */
export function getEvmExplorerUrl(network: string, txHash: string) {
  const networkLower = network.toLowerCase();

  if (networkLower === 'base') {
    return `https://basescan.org/tx/${txHash}`;
  }
  if (networkLower === 'base-sepolia') {
    return `https://sepolia.basescan.org/tx/${txHash}`;
  }
  if (networkLower === 'ethereum') {
    return `https://etherscan.io/tx/${txHash}`;
  }
  if (networkLower === 'ethereum-sepolia') {
    return `https://sepolia.etherscan.io/tx/${txHash}`;
  }

  return `Transaction Hash: ${txHash}`;
}
