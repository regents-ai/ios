/**
 * Turns a prepared payment into the one call the app's smart account sends.
 * The payment names the wallet it was prepared for; a different signer is
 * refused before anything is sent.
 */

import type { PaymentRequestWalletAction } from '../../types/regents';
import { isAddress } from 'viem';
import { base } from 'viem/chains';

export type PaymentRequestCall = {
  to: `0x${string}`;
  value: bigint;
  data: `0x${string}`;
};

const REFRESH_MESSAGE = 'Refresh this request and try again.';

function normalizeAddress(value: string, label: string): `0x${string}` {
  const trimmed = value.trim();
  if (!isAddress(trimmed)) {
    throw new Error(`${label} is not ready.`);
  }

  return trimmed as `0x${string}`;
}

function normalizeData(value: string): `0x${string}` {
  const trimmed = value.trim();
  if (!/^0x([a-fA-F0-9]{2})*$/.test(trimmed)) {
    throw new Error(REFRESH_MESSAGE);
  }

  return trimmed as `0x${string}`;
}

function normalizeValue(value: string) {
  try {
    const parsed = BigInt(value);
    if (parsed < 0n) {
      throw new Error('negative');
    }

    return parsed;
  } catch {
    throw new Error(REFRESH_MESSAGE);
  }
}

export function paymentRequestNetworkForChain(chainId: number): 'base' {
  if (chainId === base.id) {
    return 'base';
  }

  throw new Error('This payment is not on Base.');
}

export function paymentRequestCall(walletAction: PaymentRequestWalletAction, expectedSigner: string): PaymentRequestCall {
  const signer = normalizeAddress(expectedSigner, 'Your wallet');
  const actionSigner = normalizeAddress(walletAction.expected_signer, 'Your wallet');
  if (signer.toLowerCase() !== actionSigner.toLowerCase()) {
    throw new Error('Open this request with the wallet that will pay.');
  }

  paymentRequestNetworkForChain(walletAction.chain_id);

  return {
    to: normalizeAddress(walletAction.to, 'USDC'),
    value: normalizeValue(walletAction.value),
    data: normalizeData(walletAction.data),
  };
}
