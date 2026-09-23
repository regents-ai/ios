import {
  createPublicClient,
  encodeFunctionData,
  erc20Abi,
  http,
  parseEventLogs,
  TransactionReceiptNotFoundError,
  type Address,
  type Hash,
  type Hex,
  type Log,
} from 'viem';
import { base } from 'viem/chains';

import { BASE_USDC_ADDRESS } from './regentStaking.js';

/**
 * Paying an agent's request in Base USDC: the one `transfer` call the app's
 * wallet signs, and the check that a Base transaction really made that
 * payment.
 */

export type UsdcTransferWalletAction = {
  action: 'pay';
  chain_id: typeof base.id;
  request_id: string;
  to: Address;
  value: '0';
  data: Hex;
  expected_signer: Address;
  recipient: Address;
  amount_raw: string;
};

/** The single USDC `transfer(recipient, amountRaw)` call, sent by the declared wallet. */
export function prepareUsdcTransfer(input: {
  requestId: string;
  walletAddress: Address;
  recipient: Address;
  amountRaw: bigint;
}): UsdcTransferWalletAction {
  return {
    action: 'pay',
    chain_id: base.id,
    request_id: input.requestId,
    to: BASE_USDC_ADDRESS,
    value: '0',
    data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [input.recipient, input.amountRaw] }),
    expected_signer: input.walletAddress,
    recipient: input.recipient,
    amount_raw: input.amountRaw.toString(),
  };
}

export type TransferReceipt = {
  status: 'success' | 'reverted';
  logs: Log[];
};

/**
 * True only for a successful receipt carrying a Base USDC Transfer log from
 * `from` to `to` for exactly `amountRaw`. A smart-account payment lands in a
 * bundle transaction that succeeds even when the payment inside it fails, so
 * the Transfer log is the proof, not the receipt status alone.
 */
export function receiptPaysExactly(
  receipt: TransferReceipt,
  payment: { from: Address; to: Address; amountRaw: bigint },
): boolean {
  if (receipt.status !== 'success') {
    return false;
  }
  const usdcLogs = receipt.logs.filter((log) => log.address.toLowerCase() === BASE_USDC_ADDRESS.toLowerCase());
  return parseEventLogs({ abi: erc20Abi, eventName: 'Transfer', logs: usdcLogs, strict: true }).some(
    ({ args }) =>
      args.from.toLowerCase() === payment.from.toLowerCase() &&
      args.to.toLowerCase() === payment.to.toLowerCase() &&
      args.value === payment.amountRaw,
  );
}

/**
 * A failed read carries only the error's name: viem's messages quote the RPC
 * URL, which may hold a key, so they never reach a log or a response.
 */
export type TransferReceiptReadResult =
  | { kind: 'ok'; receipt: TransferReceipt }
  | { kind: 'not_found' }
  | { kind: 'missing_rpc'; requiredEnv: 'BASE_RPC_URL' }
  | { kind: 'rpc_error'; name: string };

export type TransferReceiptReader = (txHash: Hash) => Promise<TransferReceiptReadResult>;

function baseRpcUrl() {
  return process.env.BASE_RPC_URL?.trim() || '';
}

export async function readBaseTransferReceipt(txHash: Hash, rpcUrl = baseRpcUrl()): Promise<TransferReceiptReadResult> {
  if (!rpcUrl) {
    return { kind: 'missing_rpc', requiredEnv: 'BASE_RPC_URL' };
  }

  try {
    const client = createPublicClient({ chain: base, transport: http(rpcUrl) });
    const receipt = await client.getTransactionReceipt({ hash: txHash });
    return { kind: 'ok', receipt: { status: receipt.status, logs: receipt.logs } };
  } catch (error) {
    if (error instanceof TransactionReceiptNotFoundError) {
      return { kind: 'not_found' };
    }
    return {
      kind: 'rpc_error',
      name: error instanceof Error ? error.name || 'Error' : typeof error,
    };
  }
}
