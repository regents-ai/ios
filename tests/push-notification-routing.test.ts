import test from 'node:test';
import assert from 'node:assert/strict';

import { routeIntentFromNotificationData } from '../utils/pushNotificationRouting';

test('mobile message push payload routes to the message thread screen', () => {
  assert.deepEqual(
    routeIntentFromNotificationData({
      type: 'mobile_message',
      eventType: 'assistant_message',
      eventId: 'run:401',
      threadId: '101~202~301',
    }),
    {
      href: {
        pathname: '/message/[id]',
        params: { id: '101~202~301' },
      },
      refreshWallet: false,
    },
  );
});

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

test('push routing ignores missing malformed or unrelated payloads', () => {
  assert.equal(routeIntentFromNotificationData(null), null);
  assert.equal(routeIntentFromNotificationData({ type: 'mobile_message' }), null);
  assert.equal(routeIntentFromNotificationData({ type: 'mobile_message', threadId: '101~202abc' }), null);
  assert.equal(routeIntentFromNotificationData({ type: 'mobile_message', threadId: '0~202~301' }), null);
  assert.equal(routeIntentFromNotificationData({ type: 'other', threadId: '101~202~301' }), null);
  assert.equal(routeIntentFromNotificationData({ type: 'onramp_pending', transactionId: 'txn-1' }), null);
});
