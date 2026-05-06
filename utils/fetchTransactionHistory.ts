import { sendOnrampProxyRequest } from './network/onrampProxy';

export async function fetchTransactionHistory(
  userId: string,
  pageKey?: string,
  pageSize: number = 10,
  accessToken?: string
) {
  const responseJson = await sendOnrampProxyRequest<any>({
    context: 'fetchTransactionHistory',
    operation: 'buy_transactions',
    partnerUserRef: userId,
    params: {
      pageKey,
      pageSize,
    },
    authToken: accessToken,
  });

  return {
    transactions: responseJson.transactions || [],
    nextPageKey: responseJson.next_page_key,
  };
}
