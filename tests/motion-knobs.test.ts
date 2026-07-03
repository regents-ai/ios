import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MOTION_KNOB_BOUNDS,
  MOTION_KNOB_DEFAULTS,
  getMotionKnobs,
  resetMotionKnobs,
  setMotionKnob,
  subscribeMotionKnobs,
} from '../utils/motionKnobs';
import { WORD_DRAIN_CADENCE_MS, WORD_DRAIN_MAX_LAG_MS } from '../utils/streamingWordDrain';

const globalWithDev = globalThis as { __DEV__?: boolean };

test('release builds read frozen defaults and ignore writes', () => {
  globalWithDev.__DEV__ = false;
  setMotionKnob('wordDrainCadenceMs', 100);
  assert.deepEqual(getMotionKnobs(), MOTION_KNOB_DEFAULTS);
  assert.equal(Object.isFrozen(MOTION_KNOB_DEFAULTS), true);
});

test('defaults mirror the shipped word-drain constants', () => {
  assert.equal(MOTION_KNOB_DEFAULTS.wordDrainCadenceMs, WORD_DRAIN_CADENCE_MS);
  assert.equal(MOTION_KNOB_DEFAULTS.wordDrainMaxLagMs, WORD_DRAIN_MAX_LAG_MS);
});

test('debug builds tune live, clamp to bounds, notify, and reset', () => {
  globalWithDev.__DEV__ = true;
  let notified = 0;
  const unsubscribe = subscribeMotionKnobs(() => {
    notified += 1;
  });

  setMotionKnob('wordDrainCadenceMs', 96);
  assert.equal(getMotionKnobs().wordDrainCadenceMs, 96);
  assert.equal(notified, 1);

  setMotionKnob('wordDrainCadenceMs', 5);
  assert.equal(getMotionKnobs().wordDrainCadenceMs, MOTION_KNOB_BOUNDS.wordDrainCadenceMs.min);

  setMotionKnob('toastEntryMs', 99_999);
  assert.equal(getMotionKnobs().toastEntryMs, MOTION_KNOB_BOUNDS.toastEntryMs.max);

  resetMotionKnobs();
  assert.deepEqual(getMotionKnobs(), MOTION_KNOB_DEFAULTS);

  unsubscribe();
  globalWithDev.__DEV__ = false;
});
