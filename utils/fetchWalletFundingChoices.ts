import { getBaseUrl } from '@/constants/BASE_URL';
import { WalletFundingChoice } from '@/types/walletFunding';
import { authenticatedFetch } from './authenticatedFetch';

type BalanceResponse = {
  balances?: WalletFundingChoice[];
};

async function fetchAuthorizedJson(url: string): Promise<BalanceResponse> {
  const response = await authenticatedFetch(url);
  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`);
  }

  return response.json();
}

const STABLECOINS = new Set(['USDC', 'EURC']);

export async function fetchWalletFundingChoices(input: {
  evmAddress?: string | null;
}) {
  const balances: WalletFundingChoice[] = [];

  if (input.evmAddress) {
    const address = encodeURIComponent(input.evmAddress);
    const baseData = await fetchAuthorizedJson(`${getBaseUrl()}/balances/evm?address=${address}&network=base`);
    balances.push(...(baseData.balances || []).map((balance) => ({ ...balance, network: 'Base' })));
  }

  return balances.filter((balance) => {
    const symbol = balance.token?.symbol?.toUpperCase() || '';
    const rawAmount = parseFloat(balance.amount?.amount || '0');
    const decimals = parseInt(balance.amount?.decimals || '0', 10);
    const normalizedAmount = decimals > 0 ? rawAmount / Math.pow(10, decimals) : rawAmount;

    return STABLECOINS.has(symbol) && normalizedAmount > 0;
  });
}
