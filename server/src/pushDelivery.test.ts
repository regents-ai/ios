import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createApnsProviderFromEnv,
  PushDeliveryConfigurationError,
  sendPushNotification,
  type PushTokenRecord,
} from './pushDelivery.js';

const expoToken: PushTokenRecord = {
  token: 'ExponentPushToken[secret]',
  platform: 'ios',
  tokenType: 'expo',
  updatedAt: 1,
};

const nativeToken: PushTokenRecord = {
  token: 'native-token-secret',
  platform: 'ios',
  tokenType: 'native',
  updatedAt: 1,
};

const notification = {
  title: 'Purchase complete',
  body: 'Your purchase is complete.',
  data: {
    type: 'onramp_complete',
  },
};

test('Expo push tokens use Expo push delivery', async () => {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  await sendPushNotification(expoToken, notification, {
    fetchImpl: async (url, init) => {
      requests.push({ url: String(url), init: init || {} });
      return new Response(JSON.stringify({ data: { status: 'ok' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0]!.url, 'https://exp.host/--/api/v2/push/send');
  assert.equal((requests[0]!.init.headers as Record<string, string>)['Content-Type'], 'application/json');
});

test('native iOS push tokens require APNs and never fall back to Expo', async () => {
  let expoCalled = false;
  await assert.rejects(
    () => sendPushNotification(nativeToken, notification, {
      fetchImpl: async () => {
        expoCalled = true;
        return new Response('{}');
      },
    }),
    PushDeliveryConfigurationError
  );

  assert.equal(expoCalled, false);
});

test('native iOS push tokens use APNs when configured', async () => {
  const sent: Array<{ notification: unknown; token: string }> = [];
  await sendPushNotification(nativeToken, notification, {
    apnProvider: {
      async send(apnsNotification, token) {
        sent.push({ notification: apnsNotification, token });
        return { sent: [{}], failed: [] };
      },
    },
    createApnsNotification(input) {
      return { input };
    },
  });

  assert.deepEqual(sent, [
    {
      notification: { input: notification },
      token: nativeToken.token,
    },
  ]);
});

test('release runtime requires complete APNs config', async () => {
  await assert.rejects(
    () => createApnsProviderFromEnv({}, true),
    /APNS_KEY_ID, APNS_TEAM_ID, and APNS_KEY are required/
  );

  await assert.rejects(
    () => createApnsProviderFromEnv({ APNS_KEY_ID: 'key-id' }, false),
    /APNS_KEY_ID, APNS_TEAM_ID, and APNS_KEY are required/
  );

  assert.equal(await createApnsProviderFromEnv({}, false), null);
});
