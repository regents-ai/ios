import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getRegentEventHapticKind,
  getRegentHapticPattern,
} from '../components/ui/hapticMapping';
import {
  getSwipeReleaseMotion,
  getSwipeThreshold,
  hasReachedSwipeThreshold,
} from '../components/ui/swipeToConfirmMotion';

test('Regent haptics stay iOS-only and map common feedback to subtle patterns', () => {
  assert.deepEqual(getRegentHapticPattern('tap', 'ios'), { type: 'impact', style: 'light' });
  assert.deepEqual(getRegentHapticPattern('selection', 'ios'), { type: 'selection' });
  assert.deepEqual(getRegentHapticPattern('copy', 'ios'), { type: 'selection' });
  assert.deepEqual(getRegentHapticPattern('success', 'ios'), { type: 'notification', notification: 'success' });
  assert.deepEqual(getRegentHapticPattern('warning', 'ios'), { type: 'notification', notification: 'warning' });

  assert.deepEqual(getRegentHapticPattern('tap', 'android'), { type: 'none' });
  assert.deepEqual(getRegentHapticPattern('success', 'web'), { type: 'none' });
  assert.deepEqual(getRegentHapticPattern('none', 'ios'), { type: 'none' });
});

test('radial dial named events map selection, commit, and cancel feedback', () => {
  assert.equal(getRegentEventHapticKind('dialSelectionChanged'), 'selection');
  assert.equal(getRegentEventHapticKind('dialCommitted'), 'success');
  assert.equal(getRegentEventHapticKind('dialCancelled'), 'warning');
});

test('Nous Portal pairing success uses named success feedback', () => {
  assert.equal(getRegentEventHapticKind('portalPairingSucceeded'), 'success');
});

test('swipe confirmation keeps the same threshold and skips release motion when requested', () => {
  assert.equal(getSwipeThreshold(200), 160);
  assert.equal(getSwipeThreshold(-20), 0);

  assert.equal(hasReachedSwipeThreshold(159, 200), false);
  assert.equal(hasReachedSwipeThreshold(160, 200), true);
  assert.equal(hasReachedSwipeThreshold(0, 0), false);

  assert.equal(getSwipeReleaseMotion(false, 'confirm'), 'timing');
  assert.equal(getSwipeReleaseMotion(false, 'reset'), 'spring');
  assert.equal(getSwipeReleaseMotion(true, 'confirm'), 'instant');
  assert.equal(getSwipeReleaseMotion(true, 'reset'), 'instant');
});
