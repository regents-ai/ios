import test from 'node:test';
import assert from 'node:assert/strict';

import {
  drainPendingRoute,
  peekPendingRoute,
  resetPendingRouteForTest,
  setPendingRoute,
  startPendingRouteDrain,
  subscribePendingRoute,
} from '../utils/pendingRoute';

test('an intent set before drain is delivered once when drained', () => {
  resetPendingRouteForTest();
  setPendingRoute({ key: 'thread-7', href: '/message/7' });
  assert.deepEqual(peekPendingRoute(), { key: 'thread-7', href: '/message/7' });

  const drained = drainPendingRoute();
  assert.equal(drained?.key, 'thread-7');
  assert.equal(peekPendingRoute(), null, 'cleared after drain');
  assert.equal(drainPendingRoute(), null, 'nothing left to drain');
});

test('the same key never routes twice (idempotent re-fire)', () => {
  resetPendingRouteForTest();
  setPendingRoute({ key: 'notif-1', href: '/message/1' });
  drainPendingRoute();

  // A duplicate fire of the same source (e.g. getLastResponse + live listener).
  setPendingRoute({ key: 'notif-1', href: '/message/1' });
  assert.equal(peekPendingRoute(), null, 'consumed key is ignored');
});

test('the newest un-consumed intent wins if several arrive before drain', () => {
  resetPendingRouteForTest();
  setPendingRoute({ key: 'a', href: '/message/a' });
  setPendingRoute({ key: 'b', href: '/message/b' });
  assert.equal(peekPendingRoute()?.key, 'b');
});

test('subscribers are notified on set and drain (cold-launch wiring)', () => {
  resetPendingRouteForTest();
  let ticks = 0;
  const unsubscribe = subscribePendingRoute(() => {
    ticks += 1;
  });

  setPendingRoute({ key: 'x', href: '/message/x' });
  drainPendingRoute();
  assert.equal(ticks, 2, 'one for set, one for drain');

  unsubscribe();
  setPendingRoute({ key: 'y', href: '/message/y' });
  assert.equal(ticks, 2, 'no longer notified after unsubscribe');
});

test('cold-launch seam: an intent queued before drain-start navigates exactly once on start', () => {
  resetPendingRouteForTest();
  // Source fired before navigation was ready.
  setPendingRoute({ key: 'cold-1', href: '/message/cold-1' });

  const navigated: unknown[] = [];
  const stop = startPendingRouteDrain((href) => navigated.push(href));

  assert.deepEqual(navigated, ['/message/cold-1'], 'queued intent drained on start');
  assert.equal(peekPendingRoute(), null, 'nothing left pending');
  stop();
});

test('drain-start with nothing queued navigates nothing until an intent arrives', () => {
  resetPendingRouteForTest();
  const navigated: unknown[] = [];
  const stop = startPendingRouteDrain((href) => navigated.push(href));
  assert.deepEqual(navigated, [], 'idle until a source fires');

  // A live source (warm) arrives after navigation is ready.
  setPendingRoute({ key: 'warm-1', href: '/message/warm-1' });
  assert.deepEqual(navigated, ['/message/warm-1'], 'delivered once');

  // Re-firing the same key is a no-op (idempotent).
  setPendingRoute({ key: 'warm-1', href: '/message/warm-1' });
  assert.deepEqual(navigated, ['/message/warm-1'], 'still exactly once');
  stop();
});

test('after stop, further intents do not navigate', () => {
  resetPendingRouteForTest();
  const navigated: unknown[] = [];
  const stop = startPendingRouteDrain((href) => navigated.push(href));
  stop();

  setPendingRoute({ key: 'after-stop', href: '/message/after-stop' });
  assert.deepEqual(navigated, [], 'unsubscribed drainer navigates nothing');
});
