import test from 'node:test';
import assert from 'node:assert/strict';

import { messageThreadRouteFromNotificationData } from '../utils/pushNotificationRouting';

test('mobile message push payload routes to the message thread screen', () => {
  assert.deepEqual(
    messageThreadRouteFromNotificationData({
      type: 'mobile_message',
      eventType: 'assistant_message',
      eventId: 'run:401',
      threadId: '101~202~301',
    }),
    {
      pathname: '/message/[id]',
      params: { id: '101~202~301' },
    },
  );
});

test('mobile message push routing ignores missing malformed or unrelated payloads', () => {
  assert.equal(messageThreadRouteFromNotificationData(null), null);
  assert.equal(messageThreadRouteFromNotificationData({ type: 'mobile_message' }), null);
  assert.equal(messageThreadRouteFromNotificationData({ type: 'mobile_message', threadId: '101~202abc' }), null);
  assert.equal(messageThreadRouteFromNotificationData({ type: 'mobile_message', threadId: '0~202~301' }), null);
  assert.equal(messageThreadRouteFromNotificationData({ type: 'other', threadId: '101~202~301' }), null);
});
