import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPushTokenDebugResponse, canAccessPushTokenDebug } from './pushTokens.js';

test('push token debug only allows the current user', () => {
  assert.equal(canAccessPushTokenDebug('user-1', 'user-1'), true);
  assert.equal(canAccessPushTokenDebug('user-2', 'user-1'), false);
  assert.equal(canAccessPushTokenDebug('user-1', undefined), false);
});

test('push token debug response excludes raw token values and user listings', () => {
  const response = buildPushTokenDebugResponse('user-1', {
    token: 'ExponentPushToken[secret]',
    platform: 'ios',
    tokenType: 'expo',
    updatedAt: 1_710_000_000_000,
  });

  assert.deepEqual(response, {
    userId: 'user-1',
    hasToken: true,
    tokenData: {
      platform: 'ios',
      tokenType: 'expo',
      tokenLength: 25,
      updatedAt: new Date(1_710_000_000_000).toISOString(),
    },
  });
});
