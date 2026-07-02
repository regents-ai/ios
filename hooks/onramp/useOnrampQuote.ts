import { useCallback, useRef, useState } from 'react';

import { fetchBuyQuote } from '@/utils/fetchBuyQuote';
import { createLatestRequestGate, type LatestRequestGate } from '@/utils/async/latestRequestGate';

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
  const quoteRequestGateRef = useRef<LatestRequestGate | null>(null);
  if (quoteRequestGateRef.current === null) {
    quoteRequestGateRef.current = createLatestRequestGate();
  }
  const quoteRequestGate = quoteRequestGateRef.current;

  const fetchQuote = useCallback(
    async (formData: QuoteRequest) => {
      const requestId = quoteRequestGate.next();
      const isLatestRequest = () => quoteRequestGate.isLatest(requestId);
      const amount = Number.parseFloat(formData?.amount as any);

      if (!formData.amount || !formData.asset || !formData.network || !Number.isFinite(amount) || amount <= 0) {
        setCurrentQuote(null);
        setIsLoadingQuote(false);
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

        if (!isLatestRequest()) {
          return;
        }
        setCurrentQuote(quote);
      } catch (error) {
        if (!isLatestRequest()) {
          return;
        }
        console.log('Failed to fetch quote (unsupported network or demo address unavailable):', error);
        setCurrentQuote(null);
      } finally {
        if (isLatestRequest()) {
          setIsLoadingQuote(false);
        }
      }
    },
    [getAssetSymbolFromName, getNetworkNameFromDisplayName, quoteRequestGate, regentsUserId]
  );

  return {
    currentQuote,
    isLoadingQuote,
    fetchQuote,
  };
}
