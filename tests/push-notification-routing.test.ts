import test from 'node:test';
import assert from 'node:assert/strict';

import { routeIntentFromNotificationResponse } from '../utils/pushNotificationRouting';

const TAP = 'expo.modules.notifications.actions.DEFAULT';

test('onramp push payloads route to the wallet tab with a refresh request', () => {
  assert.deepEqual(
    routeIntentFromNotificationResponse(
      {
        type: 'onramp_complete',
        transactionId: 'txn-123',
        partnerUserRef: 'user-1',
      },
      TAP,
    ),
    { href: '/wallet', refreshWallet: true, startsAction: false },
  );
  assert.deepEqual(
    routeIntentFromNotificationResponse(
      {
        type: 'onramp_failed',
        transactionId: 'txn-456',
        partnerUserRef: 'user-1',
      },
      TAP,
    ),
    { href: '/wallet', refreshWallet: true, startsAction: false },
  );
});

test('offramp push payloads route to the wallet tab with a refresh request', () => {
  assert.deepEqual(
    routeIntentFromNotificationResponse(
      {
        type: 'offramp_complete',
        transactionId: 'txn-789',
        partnerUserRef: 'user-1',
      },
      TAP,
    ),
    { href: '/wallet', refreshWallet: true, startsAction: false },
  );
  assert.deepEqual(
    routeIntentFromNotificationResponse(
      {
        type: 'offramp_failed',
        transactionId: 'txn-790',
        partnerUserRef: 'user-1',
      },
      TAP,
    ),
    { href: '/wallet', refreshWallet: true, startsAction: false },
  );
});

test('a payment request opens its screen, and Pay or Decline start that step once', () => {
  const data = { type: 'payment_request', requestId: 'req-1' };

  assert.deepEqual(routeIntentFromNotificationResponse(data, TAP), {
    href: { pathname: '/request/[id]', params: { id: 'req-1' } },
    refreshWallet: false,
    startsAction: false,
  });
  assert.deepEqual(routeIntentFromNotificationResponse(data, 'pay'), {
    href: { pathname: '/request/[id]', params: { id: 'req-1', action: 'pay' } },
    refreshWallet: false,
    startsAction: true,
  });
  assert.deepEqual(routeIntentFromNotificationResponse(data, 'decline'), {
    href: { pathname: '/request/[id]', params: { id: 'req-1', action: 'decline' } },
    refreshWallet: false,
    startsAction: true,
  });
});

test('push routing ignores missing malformed or unrelated payloads', () => {
  assert.equal(routeIntentFromNotificationResponse(null, TAP), null);
  assert.equal(routeIntentFromNotificationResponse({ type: 'other' }, TAP), null);
  assert.equal(routeIntentFromNotificationResponse({ type: 'onramp_pending', transactionId: 'txn-1' }, TAP), null);
  assert.equal(routeIntentFromNotificationResponse({ type: 'payment_request' }, 'pay'), null);
  assert.equal(routeIntentFromNotificationResponse({ type: 'payment_request', requestId: '' }, TAP), null);
});
