import { useCallback, useRef, useState } from 'react';

import { PURCHASE_ASSET, PURCHASE_NETWORK } from '@/components/onramp/onramp-form-types';
import { fetchBuyQuote } from '@/utils/fetchBuyQuote';
import { createLatestRequestGate, type LatestRequestGate } from '@/utils/async/latestRequestGate';

type QuoteRequest = {
  amount: string;
  destinationAddress: string;
  paymentCurrency: string;
  paymentMethod?: string;
};

type UseOnrampQuoteArgs = {
  regentsUserId?: string | null;
};

export function useOnrampQuote({
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

      if (!formData.amount || !Number.isFinite(amount) || amount <= 0) {
        setCurrentQuote(null);
        setIsLoadingQuote(false);
        return;
      }

      try {
        setIsLoadingQuote(true);
        const userId = regentsUserId || 'unknown-user';

        const quote = await fetchBuyQuote({
          paymentAmount: formData.amount,
          paymentCurrency: formData.paymentCurrency,
          purchaseCurrency: PURCHASE_ASSET,
          destinationNetwork: PURCHASE_NETWORK,
          destinationAddress: formData.destinationAddress,
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
        console.log('Failed to fetch quote:', error);
        setCurrentQuote(null);
      } finally {
        if (isLatestRequest()) {
          setIsLoadingQuote(false);
        }
      }
    },
    [quoteRequestGate, regentsUserId]
  );

  return {
    currentQuote,
    isLoadingQuote,
    fetchQuote,
  };
}
