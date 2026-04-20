import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveAuthGateState, getVerificationSuccessAction } from '../utils/authFlowState';
import { buildGuestCheckoutQuotePayload } from '../utils/guestCheckout';

test('auth gate shows an issue instead of loading forever after wallet init failure', () => {
  const state = resolveAuthGateState({
    isReady: true,
    isPrivyReady: true,
    walletReady: false,
    hasCheckedAuth: false,
    isAuthenticated: true,
    testSession: false,
    hasAuthError: false,
    startupTimeoutReached: false,
    walletInitFailureMessage: 'We could not finish opening your wallet. Please sign in again.',
  });

  assert.deepEqual(state, {
    mode: 'issue',
    title: 'Wallet unavailable',
    message: 'We could not finish opening your wallet. Please sign in again.',
  });
});

test('verification success routes sign-in back to the wallet and dismisses link flows', () => {
  assert.equal(getVerificationSuccessAction('signin'), 'go_wallet');
  assert.equal(getVerificationSuccessAction('link'), 'dismiss');
  assert.equal(getVerificationSuccessAction('reverify'), 'dismiss');
});

test('guest checkout quote payload is always marked as a quote', () => {
  const payload = buildGuestCheckoutQuotePayload(
    {
      paymentCurrency: 'USD',
      purchaseCurrency: 'USDC',
      paymentAmount: '25',
      destinationNetwork: 'base',
      paymentMethod: 'GUEST_CHECKOUT_APPLE_PAY',
      partnerUserRef: 'user-1',
    },
    '0x123'
  );

  assert.equal(payload.isQuote, true);
  assert.equal(payload.destinationAddress, '0x123');
  assert.equal(payload.paymentMethod, 'GUEST_CHECKOUT_APPLE_PAY');
  assert.equal(payload.email, 'testquote@test.com');
  assert.equal(payload.phoneNumber, '+12345678901');
});
