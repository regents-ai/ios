type FetchLike = typeof fetch;

export type ConfirmedBaseReceipt = {
  txHash: string;
  chainId: number;
  blockNumber: number;
  status: 'confirmed';
  from: string;
  to: string;
  value: string;
  data: string;
};

export type BaseReceiptVerificationResult =
  | { kind: 'confirmed'; receipt: ConfirmedBaseReceipt }
  | { kind: 'missing_rpc'; requiredEnv: 'BASE_RPC_URL' }
  | { kind: 'not_confirmed' }
  | { kind: 'rpc_error'; message: string };

function hexToNumber(value: string) {
  return Number.parseInt(value, 16);
}

function hexToDecimalString(value?: string) {
  if (!value) {
    return '0';
  }

  return BigInt(value).toString();
}

function normalizeHex(value?: string | null) {
  return value?.toLowerCase() || '0x';
}

function getBaseRpcUrl() {
  return process.env.BASE_RPC_URL?.trim() || '';
}

export async function verifyBaseReceipt(
  txHash: string,
  fetchImpl: FetchLike = fetch,
  rpcUrl = getBaseRpcUrl()
): Promise<BaseReceiptVerificationResult> {
  if (!rpcUrl) {
    return { kind: 'missing_rpc', requiredEnv: 'BASE_RPC_URL' };
  }

  try {
    const chainResponse = await fetchImpl(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_chainId',
        params: [],
      }),
    });
    const chainPayload = await chainResponse.json() as { result?: string; error?: { message?: string } };
    if (!chainResponse.ok || chainPayload.error || chainPayload.result !== '0x2105') {
      return { kind: 'rpc_error', message: 'Base RPC did not report Base mainnet.' };
    }

    const receiptResponse = await fetchImpl(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'eth_getTransactionReceipt',
        params: [txHash],
      }),
    });
    const receiptPayload = await receiptResponse.json() as {
      result?: { status?: string; blockNumber?: string; transactionHash?: string } | null;
      error?: { message?: string };
    };

    if (!receiptResponse.ok || receiptPayload.error) {
      return { kind: 'rpc_error', message: receiptPayload.error?.message || 'Base receipt lookup failed.' };
    }

    const receipt = receiptPayload.result;
    if (!receipt || receipt.status !== '0x1' || !receipt.blockNumber) {
      return { kind: 'not_confirmed' };
    }

    const transactionResponse = await fetchImpl(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'eth_getTransactionByHash',
        params: [txHash],
      }),
    });
    const transactionPayload = await transactionResponse.json() as {
      result?: { from?: string; to?: string | null; value?: string; input?: string } | null;
      error?: { message?: string };
    };

    if (!transactionResponse.ok || transactionPayload.error) {
      return { kind: 'rpc_error', message: transactionPayload.error?.message || 'Base transaction lookup failed.' };
    }

    const transaction = transactionPayload.result;
    if (!transaction?.from || !transaction.to) {
      return { kind: 'not_confirmed' };
    }

    return {
      kind: 'confirmed',
      receipt: {
        txHash: receipt.transactionHash || txHash,
        chainId: 8453,
        blockNumber: hexToNumber(receipt.blockNumber),
        status: 'confirmed',
        from: transaction.from,
        to: transaction.to,
        value: hexToDecimalString(transaction.value),
        data: normalizeHex(transaction.input),
      },
    };
  } catch (error) {
    return {
      kind: 'rpc_error',
      message: error instanceof Error ? error.message : 'Base receipt lookup failed.',
    };
  }
}
