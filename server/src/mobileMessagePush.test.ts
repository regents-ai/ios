import test from 'node:test';
import assert from 'node:assert/strict';

import { processMobileMessagePushRequest } from './mobileMessagePush.js';
import type { PushTokenRecord } from './pushDelivery.js';

const token: PushTokenRecord = {
  token: 'ExponentPushToken[secret]',
  platform: 'ios',
  tokenType: 'expo',
  updatedAt: 1,
};

const body = {
  userId: 'did:privy:user-1',
  threadId: '101~202~303',
  eventId: 'run:404',
  eventType: 'assistant_message' as const,
  agentName: 'Atlas Capital',
  message: 'I reviewed the request.',
};

test('mobile message push trigger sends through the stored user push token', async () => {
  const sent: unknown[] = [];
  const result = await processMobileMessagePushRequest(
    {
      headers: { 'x-regent-platform-webhook-token': 'secret-token' },
      body,
    },
    {
      env: { PLATFORM_MOBILE_PUSH_WEBHOOK_TOKEN: 'secret-token' },
      async readPushTokenForUser(userId) {
        assert.equal(userId, body.userId);
        return token;
      },
      async sendPushNotification(tokenData, notification) {
        sent.push({ tokenData, notification });
      },
    },
  );

  assert.equal(result.status, 202);
  assert.deepEqual(result.body, { delivered: true });
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0], {
    tokenData: token,
    notification: {
      title: 'Atlas Capital replied',
      body: 'I reviewed the request.',
      data: {
        type: 'mobile_message',
        eventType: 'assistant_message',
        eventId: 'run:404',
        threadId: '101~202~303',
      },
    },
  });
});

test('mobile message push trigger accepts missing user tokens without leaking token data', async () => {
  const result = await processMobileMessagePushRequest(
    {
      headers: { 'x-regent-platform-webhook-token': 'secret-token' },
      body: { ...body, eventType: 'approval_request' },
    },
    {
      env: { PLATFORM_MOBILE_PUSH_WEBHOOK_TOKEN: 'secret-token' },
      async readPushTokenForUser() {
        return null;
      },
      async sendPushNotification() {
        throw new Error('should not send');
      },
    },
  );

  assert.equal(result.status, 202);
  assert.deepEqual(result.body, { delivered: false, reason: 'no_token' });
});

test('mobile message push trigger rejects bad tokens and malformed bodies', async () => {
  const badToken = await processMobileMessagePushRequest(
    {
      headers: { 'x-regent-platform-webhook-token': 'wrong-token' },
      body,
    },
    {
      env: { PLATFORM_MOBILE_PUSH_WEBHOOK_TOKEN: 'secret-token' },
      async readPushTokenForUser() {
        return token;
      },
      async sendPushNotification() {},
    },
  );

  assert.equal(badToken.status, 401);

  const badBody = await processMobileMessagePushRequest(
    {
      headers: { 'x-regent-platform-webhook-token': 'secret-token' },
      body: { ...body, threadId: '' },
    },
    {
      env: { PLATFORM_MOBILE_PUSH_WEBHOOK_TOKEN: 'secret-token' },
      async readPushTokenForUser() {
        return token;
      },
      async sendPushNotification() {},
    },
  );

  assert.equal(badBody.status, 400);
});
