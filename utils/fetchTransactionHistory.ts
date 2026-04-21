import { sendOnrampProxyRequest } from './network/onrampProxy';

export async function fetchTransactionHistory(
  userId: string,
  pageKey?: string,
  pageSize: number = 10,
  accessToken?: string
) {
  let url = `https://api.developer.coinbase.com/onramp/v1/buy/user/${encodeURIComponent(userId)}/transactions?pageSize=${pageSize}`;
  if (pageKey) {
    url += `&pageKey=${encodeURIComponent(pageKey)}`;
  }

  const responseJson = await sendOnrampProxyRequest<any>({
    context: 'fetchTransactionHistory',
    method: 'GET',
    url,
    authToken: accessToken,
  });

  return {
    transactions: responseJson.transactions || [],
    nextPageKey: responseJson.next_page_key,
  };
}
