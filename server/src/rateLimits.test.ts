import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import test from 'node:test';
import express from 'express';

import {
  createAuthenticatedApiRateLimiter,
  createAuthenticatedReadRateLimiter,
  createAuthenticatedWriteRateLimiter,
  createPublicReadRateLimiter,
  createWebhookRateLimiter,
} from './rateLimits.js';

async function withServer(app: express.Express, callback: (baseUrl: string) => Promise<void>) {
  const server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, () => resolve(listening));
  });

  try {
    const address = server.address();
    assert.equal(typeof address, 'object');
    assert(address);
    await callback(`http://127.0.0.1:${(address as AddressInfo).port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function json(response: Response) {
  return response.json() as Promise<{ error?: { code?: string } }>;
}

test('public routes return Retry-After when limited', async () => {
  const app = express();
  app.get('/public', createPublicReadRateLimiter({ max: 1, windowMs: 60_000 }), (_req, res) => {
    res.json({ ok: true });
  });

  await withServer(app, async (baseUrl) => {
    assert.equal((await fetch(`${baseUrl}/public`)).status, 200);

    const limited = await fetch(`${baseUrl}/public`);
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get('retry-after'), '60');
    assert.equal((await json(limited)).error?.code, 'TooManyPublicRequests');
  });
});

test('authenticated limits are keyed by verified user, not CLI headers', async () => {
  const app = express();
  app.use((req, _res, next) => {
    req.userId = req.header('x-test-user') || 'user-1';
    next();
  });
  app.use(
    createAuthenticatedApiRateLimiter(
      createAuthenticatedReadRateLimiter({ max: 1, windowMs: 60_000 }),
      createAuthenticatedWriteRateLimiter({ max: 1, windowMs: 60_000 })
    )
  );
  app.get('/private', (_req, res) => {
    res.json({ ok: true });
  });

  await withServer(app, async (baseUrl) => {
    assert.equal((await fetch(`${baseUrl}/private`)).status, 200);

    const spoofedCli = await fetch(`${baseUrl}/private`, {
      headers: {
        'x-regents-client': 'regents-cli',
        'x-regents-cli-version': '1.0.0',
      },
    });
    assert.equal(spoofedCli.status, 429);
    assert.equal(spoofedCli.headers.get('retry-after'), '60');
    assert.equal((await json(spoofedCli)).error?.code, 'TooManyAuthenticatedRequests');

    const otherUser = await fetch(`${baseUrl}/private`, {
      headers: { 'x-test-user': 'user-2' },
    });
    assert.equal(otherUser.status, 200);
  });
});

test('webhook routes keep their own limiter and Retry-After response', async () => {
  const app = express();
  app.post('/webhooks/onramp', createWebhookRateLimiter({ max: 1, windowMs: 60_000 }), (_req, res) => {
    res.json({ received: true });
  });

  await withServer(app, async (baseUrl) => {
    assert.equal((await fetch(`${baseUrl}/webhooks/onramp`, { method: 'POST' })).status, 200);

    const limited = await fetch(`${baseUrl}/webhooks/onramp`, { method: 'POST' });
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get('retry-after'), '60');
    assert.equal((await json(limited)).error?.code, 'TooManyWebhookRequests');
  });
});
