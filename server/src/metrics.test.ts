import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test, { beforeEach } from 'node:test';
import type { NextFunction, Request, Response } from 'express';

import {
  createHttpMetricsMiddleware,
  metricsRegistry,
  mobilePushRegistrationsTotal,
  mobileSendTotal,
  mobileWalletOpenedTotal,
  recordTransactionWebhookOutcome,
  resetMetricsForTests,
  statusClass,
} from './metrics.js';

beforeEach(() => {
  resetMetricsForTests();
});

function fakeResponse(statusCode: number) {
  const res = new EventEmitter() as EventEmitter & { statusCode: number };
  res.statusCode = statusCode;
  return res;
}

function runMiddleware(req: Partial<Request>, statusCode: number) {
  const res = fakeResponse(statusCode);
  let nextCalled = false;
  const next: NextFunction = () => {
    nextCalled = true;
  };

  createHttpMetricsMiddleware()(req as Request, res as unknown as Response, next);
  res.emit('finish');

  assert.equal(nextCalled, true);
}

test('status classes stay bounded to one label per hundred-block', () => {
  assert.equal(statusClass(200), '2xx');
  assert.equal(statusClass(301), '3xx');
  assert.equal(statusClass(404), '4xx');
  assert.equal(statusClass(503), '5xx');
});

test('request durations are labeled with the matched route pattern, never the raw URL', async () => {
  runMiddleware({ method: 'GET', baseUrl: '', route: { path: '/mobile/regents/:id' } } as Partial<Request>, 200);

  const text = await metricsRegistry.metrics();
  assert.match(
    text,
    /http_request_duration_seconds_count\{method="GET",route="\/mobile\/regents\/:id",status_code="2xx"\} 1/,
  );
  assert.doesNotMatch(text, /route="\/mobile\/regents\/regent-1"/);
});

test('requests that match no route are bucketed as unmatched to bound cardinality', async () => {
  runMiddleware({ method: 'GET', baseUrl: '', route: undefined } as Partial<Request>, 404);

  const text = await metricsRegistry.metrics();
  assert.match(
    text,
    /http_request_duration_seconds_count\{method="GET",route="unmatched",status_code="4xx"\} 1/,
  );
});

test('verified transaction webhook outcomes count buys and cash-outs by result', async () => {
  recordTransactionWebhookOutcome('onramp.transaction.success');
  recordTransactionWebhookOutcome('onramp.transaction.failed');
  recordTransactionWebhookOutcome('offramp.transaction.success');
  recordTransactionWebhookOutcome('offramp.transaction.failed');
  // Lifecycle-only events are not settlements and must not count.
  recordTransactionWebhookOutcome('onramp.transaction.created');
  recordTransactionWebhookOutcome('offramp.transaction.updated');

  const text = await metricsRegistry.metrics();
  assert.match(text, /mobile_buy_total\{result="ok"\} 1/);
  assert.match(text, /mobile_buy_total\{result="failed"\} 1/);
  assert.match(text, /mobile_cash_out_total\{result="ok"\} 1/);
  assert.match(text, /mobile_cash_out_total\{result="failed"\} 1/);
});

test('the five BI counters expose the exact metric names the dashboard queries', async () => {
  mobileWalletOpenedTotal.inc();
  mobilePushRegistrationsTotal.inc();
  mobileSendTotal.inc({ result: 'ok' });
  recordTransactionWebhookOutcome('onramp.transaction.success');
  recordTransactionWebhookOutcome('offramp.transaction.success');

  const text = await metricsRegistry.metrics();
  assert.match(text, /mobile_wallet_opened_total 1/);
  assert.match(text, /mobile_push_registrations_total 1/);
  assert.match(text, /mobile_send_total\{result="ok"\} 1/);
  assert.match(text, /mobile_buy_total\{result="ok"\} 1/);
  assert.match(text, /mobile_cash_out_total\{result="ok"\} 1/);
});

test('the registry serves Prometheus text exposition with default process metrics', async () => {
  assert.match(metricsRegistry.contentType, /text\/plain/);

  const text = await metricsRegistry.metrics();
  assert.match(text, /process_cpu_user_seconds_total/);
  assert.match(text, /nodejs_eventloop_lag_seconds/);
});

