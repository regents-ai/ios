import { getBaseUrl } from '@/constants/BASE_URL';

import { authenticatedFetch } from './authenticatedFetch';

/**
 * Read-only transaction event feed (GET /events/onramp).
 *
 * Mirrors the TransactionEvent schema in api-contract.openapiv3.yaml: the
 * backend records onramp and offramp lifecycle events from verified Coinbase
 * webhooks, scoped to the signed-in user. Display only — nothing here moves
 * money.
 */

export type TransactionEventType =
  | 'onramp.transaction.created'
  | 'onramp.transaction.updated'
  | 'onramp.transaction.success'
  | 'onramp.transaction.failed'
  | 'offramp.transaction.created'
  | 'offramp.transaction.updated'
  | 'offramp.transaction.success'
  | 'offramp.transaction.failed';

export type TransactionEvent = {
  eventType: TransactionEventType;
  transactionId: string;
  occurredAt: string;
  amount?: string;
  currency?: string;
  network?: string;
  failureReason?: string;
};

export async function fetchOnrampEvents(accessToken?: string): Promise<TransactionEvent[]> {
  const endpoint = `${getBaseUrl()}/events/onramp`;

  const response = accessToken
    ? await fetch(endpoint, { headers: { Authorization: `Bearer ${accessToken}` } })
    : await authenticatedFetch(endpoint);

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const responseJson = (await response.json()) as { events?: TransactionEvent[] };
  return responseJson.events ?? [];
}
