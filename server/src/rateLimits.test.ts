import assert from 'node:assert/strict';
import test from 'node:test';
import express, { type Request, type Response } from 'express';

import {
  createAuthenticatedApiRateLimiter,
  createAuthenticatedReadRateLimiter,
  createAuthenticatedWriteRateLimiter,
  createPublicReadRateLimiter,
  createWebhookRateLimiter,
} from './rateLimits.js';

async function requestApp(
  app: express.Express,
  input: {
    method?: 'GET' | 'POST';
    url: string;
    headers?: Record<string, string>;
    body?: unknown;
  }
) {
  const headers = Object.fromEntries(
    Object.entries(input.headers || {}).map(([name, value]) => [name.toLowerCase(), value])
  );

  return new Promise<{ status: number; body: any; headers: Record<string, string> }>((resolve, reject) => {
    let resolved = false;
    let statusCode = 200;
    let responseBody: any;
    const responseHeaders: Record<string, string> = {};
    const requestUrl = new URL(input.url, 'http://localhost');

    const request = {
      method: input.method || 'GET',
      url: input.url,
      originalUrl: input.url,
      path: requestUrl.pathname,
      headers,
      body: input.body,
      query: Object.fromEntries(requestUrl.searchParams.entries()),
      ip: '127.0.0.1',
      socket: {
        remoteAddress: '127.0.0.1',
      },
      header(name: string) {
        return headers[name.toLowerCase()];
      },
      get(name: string) {
        return headers[name.toLowerCase()];
      },
    } as unknown as Request;

    const finish = () => {
      if (!resolved) {
        resolved = true;
        resolve({ status: statusCode, body: responseBody, headers: responseHeaders });
      }
    };

    const response = {
      req: request,
      locals: {},
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(payload: unknown) {
        responseBody = payload;
        finish();
        return this;
      },
      send(payload: unknown) {
        responseBody = payload;
        finish();
        return this;
      },
      end(payload?: unknown) {
        responseBody = responseBody ?? payload;
        finish();
        return this;
      },
      setHeader(name: string, value: string | number | readonly string[]) {
        responseHeaders[name.toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value);
        return this;
      },
      getHeader(name: string) {
        return responseHeaders[name.toLowerCase()];
      },
      hasHeader(name: string) {
        return Object.hasOwn(responseHeaders, name.toLowerCase());
      },
      removeHeader(name: string) {
        delete responseHeaders[name.toLowerCase()];
        return this;
      },
    } as unknown as Response;

    const handler = app as unknown as {
      handle(request: Request, response: Response, next: (error?: unknown) => void): void;
    };

    handler.handle(request, response, (error?: unknown) => {
      if (error) {
        reject(error);
        return;
      }

      finish();
    });
  });
}

test('public routes return Retry-After when limited', async () => {
  const app = express();
  app.get('/public', createPublicReadRateLimiter({ max: 1, windowMs: 60_000 }), (_req, res) => {
    res.json({ ok: true });
  });

  assert.equal((await requestApp(app, { url: '/public' })).status, 200);

  const limited = await requestApp(app, { url: '/public' });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers['retry-after'], '60');
  assert.equal(limited.body.error?.code, 'TooManyPublicRequests');
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

  assert.equal((await requestApp(app, { url: '/private' })).status, 200);

  const spoofedCli = await requestApp(app, {
    url: '/private',
    headers: {
      'x-regents-client': 'regents-cli',
      'x-regents-cli-version': '1.0.0',
    },
  });
  assert.equal(spoofedCli.status, 429);
  assert.equal(spoofedCli.headers['retry-after'], '60');
  assert.equal(spoofedCli.body.error?.code, 'TooManyAuthenticatedRequests');

  const otherUser = await requestApp(app, {
    url: '/private',
    headers: { 'x-test-user': 'user-2' },
  });
  assert.equal(otherUser.status, 200);
});

test('webhook routes keep their own limiter and Retry-After response', async () => {
  const app = express();
  app.post('/webhooks/onramp', createWebhookRateLimiter({ max: 1, windowMs: 60_000 }), (_req, res) => {
    res.json({ received: true });
  });

  assert.equal((await requestApp(app, { method: 'POST', url: '/webhooks/onramp' })).status, 200);

  const limited = await requestApp(app, { method: 'POST', url: '/webhooks/onramp' });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers['retry-after'], '60');
  assert.equal(limited.body.error?.code, 'TooManyWebhookRequests');
});
