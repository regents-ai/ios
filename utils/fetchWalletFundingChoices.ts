import { getBaseUrl } from '@/constants/BASE_URL';
import { WalletFundingChoice } from '@/types/agents';
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
  solanaAddress?: string | null;
}) {
  const balances: WalletFundingChoice[] = [];

  if (input.evmAddress) {
    const [baseData, ethereumData] = await Promise.all([
      fetchAuthorizedJson(`${getBaseUrl()}/balances/evm?address=${input.evmAddress}&network=base`),
      fetchAuthorizedJson(`${getBaseUrl()}/balances/evm?address=${input.evmAddress}&network=ethereum`),
    ]);

    balances.push(...(baseData.balances || []).map((balance) => ({ ...balance, network: 'Base' })));
    balances.push(...(ethereumData.balances || []).map((balance) => ({ ...balance, network: 'Ethereum' })));
  }

  if (input.solanaAddress) {
    const solanaData = await fetchAuthorizedJson(`${getBaseUrl()}/balances/solana?address=${input.solanaAddress}`);
    balances.push(...(solanaData.balances || []).map((balance) => ({ ...balance, network: 'Solana' })));
  }

  return balances.filter((balance) => {
    const symbol = balance.token?.symbol?.toUpperCase() || '';
    const rawAmount = parseFloat(balance.amount?.amount || '0');
    const decimals = parseInt(balance.amount?.decimals || '0', 10);
    const normalizedAmount = decimals > 0 ? rawAmount / Math.pow(10, decimals) : rawAmount;

    return STABLECOINS.has(symbol) && normalizedAmount > 0;
  });
}
