import test from 'node:test';
import assert from 'node:assert/strict';

import { ApiError } from '../utils/apiError';
import {
  mayFallBackToCache,
  mutationsAllowed,
  resolveCacheGate,
} from '../utils/cacheFallbackPolicy';

test('connectivity drops and transient 5xx are cache-eligible', () => {
  assert.equal(mayFallBackToCache(new TypeError('Network request failed')), true);
  assert.equal(mayFallBackToCache(new ApiError('network', 'offline')), true);
  assert.equal(mayFallBackToCache(new ApiError('server', 'boom', 500)), true);
  assert.equal(mayFallBackToCache(new ApiError('server', 'boom', 503)), true);
});

test('4xx failures are NEVER cache-eligible', () => {
  assert.equal(mayFallBackToCache(new ApiError('auth', 'signed out', 401)), false);
  assert.equal(mayFallBackToCache(new ApiError('permission', 'no', 403)), false);
  assert.equal(mayFallBackToCache(new ApiError('not-found', 'gone', 404)), false);
  assert.equal(mayFallBackToCache(new ApiError('rate-limited', 'slow', 429)), false);
});

test('a successful outcome resolves to live data', () => {
  const gate = resolveCacheGate({ ok: true, data: [1, 2, 3] }, null);
  assert.deepEqual(gate, { data: [1, 2, 3], mode: 'live' });
});

test('an eligible failure with a cached snapshot resolves to read-only cached data', () => {
  const gate = resolveCacheGate({ ok: false, error: new TypeError('offline') }, ['cached']);
  assert.deepEqual(gate, { data: ['cached'], mode: 'cached' });
});

test('an ineligible failure never serves cache, even if cache exists', () => {
  const gate = resolveCacheGate({ ok: false, error: new ApiError('not-found', 'gone', 404) }, ['cached']);
  assert.equal(gate, null, '4xx must surface the error, not stale data');
});

test('an eligible failure with no cache surfaces the error', () => {
  assert.equal(resolveCacheGate({ ok: false, error: new TypeError('offline') }, null), null);
});

test('mutations are blocked in cached mode and allowed live', () => {
  assert.equal(mutationsAllowed('live'), true);
  assert.equal(mutationsAllowed('cached'), false);
});
