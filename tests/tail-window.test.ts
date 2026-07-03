import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TAIL_WINDOW_INITIAL,
  TAIL_WINDOW_STEP,
  initialTailWindow,
  loadOlder,
  reconcileAppend,
  resolveTailWindow,
} from '../utils/tailWindow';

function makeItems(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index);
}

test('a short transcript shows everything with no older capsule', () => {
  const all = makeItems(5);
  const resolved = resolveTailWindow(all, initialTailWindow());
  assert.deepEqual(resolved.items, all);
  assert.equal(resolved.hasOlder, false);
  assert.equal(resolved.hiddenOlderCount, 0);
});

test('a long transcript shows only the newest window and flags older items', () => {
  const all = makeItems(TAIL_WINDOW_INITIAL + 12);
  const resolved = resolveTailWindow(all, initialTailWindow());
  assert.equal(resolved.items.length, TAIL_WINDOW_INITIAL);
  assert.equal(resolved.items[resolved.items.length - 1], all[all.length - 1], 'live tail is visible');
  assert.equal(resolved.hasOlder, true);
  assert.equal(resolved.hiddenOlderCount, 12);
});

test('load older reveals one batch, capped at the total', () => {
  const all = makeItems(TAIL_WINDOW_INITIAL + TAIL_WINDOW_STEP + 5);
  let state = initialTailWindow();
  state = loadOlder(state, all.length);
  let resolved = resolveTailWindow(all, state);
  assert.equal(resolved.hiddenOlderCount, 5);

  state = loadOlder(state, all.length);
  resolved = resolveTailWindow(all, state);
  assert.equal(resolved.hasOlder, false, 'all older revealed, no more capsule');
  assert.equal(resolved.items.length, all.length);
});

test('appended tail items grow the window so the live tail stays visible', () => {
  const before = makeItems(TAIL_WINDOW_INITIAL + 10);
  let state = initialTailWindow();
  // Two new events arrive at the bottom.
  state = reconcileAppend(state, before.length, before.length + 2);
  const after = makeItems(before.length + 2);
  const resolved = resolveTailWindow(after, state);

  assert.equal(resolved.items[resolved.items.length - 1], after[after.length - 1], 'newest event shown');
  assert.equal(resolved.items.length, TAIL_WINDOW_INITIAL + 2, 'window grew by the appended count');
});

test('reconcile does not reveal older history when nothing was appended', () => {
  const all = makeItems(TAIL_WINDOW_INITIAL + 10);
  const state = reconcileAppend(initialTailWindow(), all.length, all.length);
  assert.equal(resolveTailWindow(all, state).items.length, TAIL_WINDOW_INITIAL);
});
