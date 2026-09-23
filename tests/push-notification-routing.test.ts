import test from 'node:test';
import assert from 'node:assert/strict';

import { routeIntentFromNotificationData } from '../utils/pushNotificationRouting';

test('onramp push payloads route to the wallet tab with a refresh request', () => {
  assert.deepEqual(
    routeIntentFromNotificationData({
      type: 'onramp_complete',
      transactionId: 'txn-123',
      partnerUserRef: 'user-1',
    }),
    { href: '/wallet', refreshWallet: true },
  );
  assert.deepEqual(
    routeIntentFromNotificationData({
      type: 'onramp_failed',
      transactionId: 'txn-456',
      partnerUserRef: 'user-1',
    }),
    { href: '/wallet', refreshWallet: true },
  );
});

test('offramp push payloads route to the wallet tab with a refresh request', () => {
  assert.deepEqual(
    routeIntentFromNotificationData({
      type: 'offramp_complete',
      transactionId: 'txn-789',
      partnerUserRef: 'user-1',
    }),
    { href: '/wallet', refreshWallet: true },
  );
  assert.deepEqual(
    routeIntentFromNotificationData({
      type: 'offramp_failed',
      transactionId: 'txn-790',
      partnerUserRef: 'user-1',
    }),
    { href: '/wallet', refreshWallet: true },
  );
});

test('push routing ignores missing malformed or unrelated payloads', () => {
  assert.equal(routeIntentFromNotificationData(null), null);
  assert.equal(routeIntentFromNotificationData({ type: 'other' }), null);
  assert.equal(routeIntentFromNotificationData({ type: 'onramp_pending', transactionId: 'txn-1' }), null);
});
