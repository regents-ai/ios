import test from 'node:test';
import assert from 'node:assert/strict';

import { summarizeWebhookLog } from '../server/src/security.js';
import { summarizeGuestCheckoutOrderLog } from '../utils/guestCheckout';
import { getGuestCheckoutBlocker } from '../utils/onrampEligibility';

test('guest checkout buy flow stays blocked outside the US', () => {
  assert.equal(
    getGuestCheckoutBlocker({
      isGuestCheckout: true,
      country: 'CA',
      linkedEmail: 'person@example.com',
      linkedPhone: '+12345678901',
      hasFreshVerifiedPhone: true,
    }),
    'region'
  );
});

test('guest checkout buy flow stays blocked until contact details are fully verified', () => {
  assert.equal(
    getGuestCheckoutBlocker({
      isGuestCheckout: true,
      country: 'US',
      linkedEmail: 'person@example.com',
      linkedPhone: '+12345678901',
      hasFreshVerifiedPhone: false,
    }),
    'verification'
  );

  assert.equal(
    getGuestCheckoutBlocker({
      isGuestCheckout: true,
      country: 'US',
      linkedEmail: 'person@example.com',
      linkedPhone: '+12345678901',
      hasFreshVerifiedPhone: true,
    }),
    null
  );
});

test('webhook logs keep event context without printing full payloads', () => {
  const summary = summarizeWebhookLog({
    eventType: 'onramp.transaction.success',
    transactionId: 'tx-123',
    partnerUserRef: 'user-1',
    destinationAddress: '0xabc',
    purchaseAmount: { value: '25.00', currency: 'USDC' },
  });

  assert.equal(summary.eventType, 'onramp.transaction.success');
  assert.match(summary.transactionIdHash!, /^[a-f0-9]{16}$/);
  assert.match(summary.partnerUserRefHash!, /^[a-f0-9]{16}$/);
  assert.equal(JSON.stringify(summary).includes('tx-123'), false);
  assert.equal(JSON.stringify(summary).includes('user-1'), false);
  assert.equal(summary.keyCount, 5);
  assert.deepEqual(summary.keys, ['destinationAddress', 'eventType', 'partnerUserRef', 'purchaseAmount', 'transactionId']);
});

test('guest checkout success logs only expose a short response summary', () => {
  assert.deepEqual(
    summarizeGuestCheckoutOrderLog({
      paymentLink: { url: 'https://pay.coinbase.com/abc' },
      order: { orderId: 'order-1' },
      email: 'person@example.com',
      phoneNumber: '+12345678901',
    }),
    {
      hasHostedUrl: true,
      hasOrderId: true,
      keyCount: 4,
      keys: ['email', 'order', 'paymentLink', 'phoneNumber'],
    }
  );
});
