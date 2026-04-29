let currentWalletAddress: string | null = null;
let currentSolanaAddress: string | null = null;
let currentNetwork = 'Base';
const listeners = new Set<() => void>();

function notifyWalletRuntimeListeners() {
  listeners.forEach((listener) => listener());
}

export function setCurrentWalletAddress(address: string | null) {
  currentWalletAddress = address;
  notifyWalletRuntimeListeners();
}

export function setCurrentSolanaAddress(address: string | null) {
  currentSolanaAddress = address;
  notifyWalletRuntimeListeners();
}

export function setCurrentNetwork(network: string) {
  currentNetwork = network;
  notifyWalletRuntimeListeners();
}

export function getCurrentNetwork() {
  return currentNetwork;
}

export function subscribeWalletRuntime(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function getWalletAddressForNetwork(network: string) {
  const networkLower = network.toLowerCase();
  const isSolanaNetwork = ['solana', 'sol'].some((key) => networkLower.includes(key));
  const isEvmNetwork = [
    'ethereum',
    'base',
    'unichain',
    'polygon',
    'arbitrum',
    'optimism',
    'avalanche',
    'avax',
    'bsc',
    'fantom',
    'linea',
    'zksync',
    'scroll',
  ].some((key) => networkLower.includes(key));

  if (isSolanaNetwork) {
    return currentSolanaAddress || null;
  }

  if (isEvmNetwork) {
    return currentWalletAddress || null;
  }

  return null;
}

export function getCurrentWalletAddress() {
  return getWalletAddressForNetwork(currentNetwork);
}
