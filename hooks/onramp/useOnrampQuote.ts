import { useCallback, useState } from 'react';

import { fetchBuyQuote } from '@/utils/fetchBuyQuote';

type QuoteRequest = {
  amount: string;
  asset: string;
  network: string;
  paymentCurrency: string;
  paymentMethod?: string;
};

type UseOnrampQuoteArgs = {
  getAssetSymbolFromName: (assetName: string) => string;
  getNetworkNameFromDisplayName: (displayName: string) => string;
  regentsUserId?: string | null;
};

export function useOnrampQuote({
  getAssetSymbolFromName,
  getNetworkNameFromDisplayName,
  regentsUserId,
}: UseOnrampQuoteArgs) {
  const [currentQuote, setCurrentQuote] = useState<any>(null);
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);

  const fetchQuote = useCallback(
    async (formData: QuoteRequest) => {
      const amount = Number.parseFloat(formData?.amount as any);

      if (!formData.amount || !formData.asset || !formData.network || !Number.isFinite(amount) || amount <= 0) {
        setCurrentQuote(null);
        return;
      }

      try {
        setIsLoadingQuote(true);
        const assetSymbol = getAssetSymbolFromName(formData.asset);
        const networkName = getNetworkNameFromDisplayName(formData.network);
        const userId = regentsUserId || 'unknown-user';

        const quote = await fetchBuyQuote({
          paymentAmount: formData.amount,
          paymentCurrency: formData.paymentCurrency,
          purchaseCurrency: assetSymbol,
          destinationNetwork: networkName,
          paymentMethod: formData.paymentMethod || 'COINBASE_WIDGET',
          partnerUserRef: userId,
        });

        setCurrentQuote(quote);
      } catch (error) {
        console.log('Failed to fetch quote (unsupported network or demo address unavailable):', error);
        setCurrentQuote(null);
      } finally {
        setIsLoadingQuote(false);
      }
    },
    [getAssetSymbolFromName, getNetworkNameFromDisplayName, regentsUserId]
  );

  return {
    currentQuote,
    isLoadingQuote,
    fetchQuote,
  };
}
