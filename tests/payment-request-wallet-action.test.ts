import test from 'node:test';
import assert from 'node:assert/strict';

import type { PaymentRequestWalletAction } from '../types/regents';
import { paymentRequestCall, paymentRequestNetworkForChain } from '../utils/onchain/paymentRequestWalletAction';

const payer = '0x1111111111111111111111111111111111111111';
const usdc = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

function walletAction(overrides: Partial<PaymentRequestWalletAction> = {}): PaymentRequestWalletAction {
  return {
    action: 'pay',
    chain_id: 8453,
    request_id: 'req-1',
    to: usdc,
    value: '0',
    data: '0xa9059cbb',
    expected_signer: payer,
    recipient: '0x2222222222222222222222222222222222222222',
    amount_raw: '5000000',
    ...overrides,
  };
}

test('a prepared payment becomes one USDC call from the wallet it names', () => {
  assert.deepEqual(paymentRequestCall(walletAction(), payer), { to: usdc, value: 0n, data: '0xa9059cbb' });
  assert.deepEqual(paymentRequestCall(walletAction(), payer.toUpperCase().replace('0X', '0x')).to, usdc);
});

test('a payment prepared for another wallet, another network or with damaged calldata is not sent', () => {
  assert.throws(
    () => paymentRequestCall(walletAction({ expected_signer: '0x3333333333333333333333333333333333333333' }), payer),
    /wallet that will pay/,
  );
  assert.throws(() => paymentRequestCall(walletAction({ chain_id: 1 }), payer), /not on Base/);
  assert.throws(() => paymentRequestCall(walletAction({ data: '0xabc' }), payer), /Refresh this request/);
  assert.throws(() => paymentRequestCall(walletAction({ value: '-1' }), payer), /Refresh this request/);
  assert.equal(paymentRequestNetworkForChain(8453), 'base');
});
