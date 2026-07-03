import test from 'node:test';
import assert from 'node:assert/strict';

import {
  confirmNotice,
  failNotice,
  initialLocalNotices,
  pinNotice,
} from '../utils/localNotices';

function pinOne(id: string) {
  return pinNotice(initialLocalNotices, {
    id,
    pendingLabel: 'Transfer submitted',
    confirmedLabel: 'Transfer confirmed',
    createdAtMs: 1000,
  });
}

test('a pinned notice starts pending and above the composer', () => {
  const state = pinOne('n1');
  assert.equal(state.pinned.length, 1);
  assert.equal(state.pinned[0].status, 'pending');
  assert.equal(state.flushed.length, 0);
});

test('confirming unpins the notice and flushes a permanent transcript entry', () => {
  const state = confirmNotice(pinOne('n1'), 'n1', 2000);
  assert.equal(state.pinned.length, 0, 'no longer pinned');
  assert.equal(state.flushed.length, 1);
  assert.equal(state.flushed[0].label, 'Transfer confirmed');
  assert.equal(state.flushed[0].atMs, 2000);
});

test('failing unpins the notice and flushes nothing', () => {
  const state = failNotice(pinOne('n1'), 'n1');
  assert.equal(state.pinned.length, 0);
  assert.equal(state.flushed.length, 0);
});

test('confirming an unknown id is a no-op', () => {
  const before = pinOne('n1');
  const after = confirmNotice(before, 'nope', 5000);
  assert.deepEqual(after, before);
});

test('multiple notices flush independently in order', () => {
  let state = pinOne('n1');
  state = pinNotice(state, { id: 'n2', pendingLabel: 'Swap submitted', confirmedLabel: 'Swap confirmed', createdAtMs: 1100 });
  state = confirmNotice(state, 'n1', 3000);
  assert.deepEqual(state.pinned.map((n) => n.id), ['n2']);
  assert.deepEqual(state.flushed.map((f) => f.label), ['Transfer confirmed']);
});
