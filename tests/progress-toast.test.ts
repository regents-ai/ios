import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TOAST_AUTO_DISMISS_MS,
  resolveToastSuccess,
  showProgressToast,
} from '../utils/progressToast';

test('showProgressToast starts a spinner toast with no auto-dismiss', () => {
  const toast = showProgressToast('Opening stake review...');
  assert.equal(toast.phase, 'progress');
  assert.equal(toast.label, 'Opening stake review...');
  assert.equal(toast.dismissAtMs, null);
});

test('each new toast gets a fresh id so the entry animation re-runs', () => {
  const first = showProgressToast('First');
  const second = showProgressToast('Second');
  assert.notEqual(first.id, second.id);
});

test('resolveToastSuccess morphs in place, keeping the id and arming dismissal', () => {
  const progress = showProgressToast('Opening USDC claim...');
  const success = resolveToastSuccess(progress, 'USDC claim sent', 10_000);
  assert.equal(success.id, progress.id);
  assert.equal(success.phase, 'success');
  assert.equal(success.label, 'USDC claim sent');
  assert.equal(success.dismissAtMs, 10_000 + TOAST_AUTO_DISMISS_MS);
});

test('resolveToastSuccess with no toast on screen shows a fresh one', () => {
  const previous = showProgressToast('Something else');
  const success = resolveToastSuccess(null, 'Stake sent', 0);
  assert.equal(success.phase, 'success');
  assert.notEqual(success.id, previous.id);
});

test('success over a previous success re-keys, so the checkmark re-animates', () => {
  const first = resolveToastSuccess(null, 'Stake sent', 0);
  const second = resolveToastSuccess(first, 'Stake sent', 1_000);
  assert.notEqual(second.id, first.id);
});
