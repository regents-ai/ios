import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after, before } from 'node:test';

// The webhook route reads WEBHOOK_SECRET from the environment at request
// time; set it before the app boots so signed test events verify. The state
// dir points at a fresh temp dir so the local-dev JSON store starts empty
// (webhook dedupe is durable there and would otherwise leak between runs).
process.env.WEBHOOK_SECRET = 'test-secret';
process.env.REGENTS_MOBILE_STATE_DIR = mkdtempSync(join(tmpdir(), 'regents-mobile-observability-test-'));

// Importing the real app: without REDIS_URL and outside release runtime it
// boots on in-memory state, which is exactly what these route tests need.
const { default: app } = await import('./app.js');

let server: Server;
let baseUrl: string;

before(async () => {
  await new Promise<void>((resolveListen) => {
    server = app.listen(0, () => resolveListen());
  });

  const address = server.address();
  assert.ok(address && typeof address === 'object');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(() => {
  // Keep-alive sockets from fetch would otherwise hold the process open.
  server.closeAllConnections();
  server.close();
});

function signedWebhookRequest(payload: Record<string, unknown>) {
  const rawBody = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signedPayload = [timestamp, 'content-type', 'application/json', rawBody].join('.');
  const signature = crypto.createHmac('sha256', 'test-secret').update(signedPayload).digest('hex');

  return {
    body: rawBody,
    headers: {
      'content-type': 'application/json',
      'x-hook0-signature': `t=${timestamp},h=content-type,v1=${signature}`,
    },
  };
}

test('GET /healthz reports liveness without auth', async () => {
  const response = await fetch(`${baseUrl}/healthz`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, message: 'Server is running' });
});

test('GET /readyz reports readiness without auth', async () => {
  const response = await fetch(`${baseUrl}/readyz`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, redis: 'not_configured' });
});

test('a verified buy settlement increments mobile_buy_total and /metrics serves it', async () => {
  const request = signedWebhookRequest({
    eventType: 'onramp.transaction.success',
    transactionId: 'tx-metrics-1',
    partnerUserRef: 'user-metrics-1',
    purchaseAmount: '25.00',
    purchaseCurrency: 'USDC',
    destinationNetwork: 'base',
  });

  const webhookResponse = await fetch(`${baseUrl}/webhooks/onramp`, {
    method: 'POST',
    headers: request.headers,
    body: request.body,
  });
  assert.equal(webhookResponse.status, 200);
  assert.deepEqual(await webhookResponse.json(), { received: true });

  const metricsResponse = await fetch(`${baseUrl}/metrics`);
  assert.equal(metricsResponse.status, 200);
  assert.match(metricsResponse.headers.get('content-type') || '', /text\/plain/);

  const text = await metricsResponse.text();
  assert.match(text, /mobile_buy_total\{result="ok"\} 1/);
  // Request timing is labeled by route pattern with bounded status classes.
  assert.match(text, /http_request_duration_seconds_count\{method="GET",route="\/healthz",status_code="2xx"\} 1/);
  assert.match(text, /http_request_duration_seconds_bucket/);
});

test('a verified cash-out failure increments mobile_cash_out_total{result="failed"}', async () => {
  const request = signedWebhookRequest({
    eventType: 'offramp.transaction.failed',
    transactionId: 'off-tx-metrics-1',
    partnerUserRef: 'user-metrics-1',
    failureReason: 'bank transfer rejected',
  });

  const webhookResponse = await fetch(`${baseUrl}/webhooks/onramp`, {
    method: 'POST',
    headers: request.headers,
    body: request.body,
  });
  assert.equal(webhookResponse.status, 200);

  const text = await (await fetch(`${baseUrl}/metrics`)).text();
  assert.match(text, /mobile_cash_out_total\{result="failed"\} 1/);
});

test('duplicate webhook deliveries do not double count settlements', async () => {
  const request = signedWebhookRequest({
    eventType: 'onramp.transaction.success',
    transactionId: 'tx-metrics-1',
    partnerUserRef: 'user-metrics-1',
    purchaseAmount: '25.00',
    purchaseCurrency: 'USDC',
    destinationNetwork: 'base',
  });

  const duplicateResponse = await fetch(`${baseUrl}/webhooks/onramp`, {
    method: 'POST',
    headers: request.headers,
    body: request.body,
  });
  assert.equal(duplicateResponse.status, 200);
  assert.deepEqual(await duplicateResponse.json(), { received: true, duplicate: true });

  const text = await (await fetch(`${baseUrl}/metrics`)).text();
  assert.match(text, /mobile_buy_total\{result="ok"\} 1/);
});
