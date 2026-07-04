import assert from 'node:assert/strict';
import test from 'node:test';

import { checkReadiness } from './health.js';

test('readiness is ok without Redis configured (local dev in-memory mode)', async () => {
  assert.deepEqual(
    await checkReadiness({ redisPing: null }),
    { ok: true, redis: 'not_configured' },
  );
});

test('readiness is ok when Redis answers the PING', async () => {
  assert.deepEqual(
    await checkReadiness({ redisPing: async () => 'PONG' }),
    { ok: true, redis: 'ok' },
  );
});

test('readiness fails when Redis PING rejects', async () => {
  assert.deepEqual(
    await checkReadiness({
      redisPing: async () => {
        throw new Error('connection lost');
      },
    }),
    { ok: false, redis: 'unreachable' },
  );
});

test('readiness fails when Redis PING hangs past the timeout', async () => {
  const result = await checkReadiness({
    redisPing: () => new Promise(() => undefined),
    pingTimeoutMs: 20,
  });

  assert.deepEqual(result, { ok: false, redis: 'unreachable' });
});
