import { sendOnrampProxyRequest } from './network/onrampProxy';

interface MonetaryAmount {
  value: string;
  currency: string;
  cbrn: string;
}

export interface OfframpTransaction {
  transaction_id: string;
  status: string;
  asset: string;
  network: string;
  sell_amount: MonetaryAmount;  // { value: "1.5", currency: "USDC" }
  total: MonetaryAmount;        // { value: "2", currency: "SGD" } — fiat payout
  to_address: string;
  from_address: string;
  created_at: string;
  updated_at: string;
}

/**
 * Fetches the most recent offramp transaction for a given partnerUserRef.
 * Called once after Coinbase redirects back to the app — the transaction
 * already exists at that point (created when user clicked "Cash out now").
 */
export async function fetchOfframpTransaction(
  partnerUserRef: string
): Promise<OfframpTransaction | null> {
  console.log('📤 [OFFRAMP TX] Fetching transaction for', partnerUserRef);

  const data = await sendOnrampProxyRequest<{ transactions?: OfframpTransaction[] }>({
    context: 'fetchOfframpTransaction',
    operation: 'sell_transactions',
    partnerUserRef,
  });
  const transactions: OfframpTransaction[] = data.transactions || [];

  console.log(`📥 [OFFRAMP TX] ${transactions.length} transaction(s) found`);

  if (transactions.length === 0) return null;

  // Most recent transaction first
  return transactions[0];
}
