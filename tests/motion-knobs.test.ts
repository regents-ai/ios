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
import {
  DIAL_BASE_PETAL_SIZE,
  DIAL_RING_GAP,
  DIAL_TUNING_DEFAULTS,
} from '../utils/dialConstants';

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

test('dial defaults mirror the frozen shipping tuning', () => {
  assert.equal(MOTION_KNOB_DEFAULTS.dialDeadZoneRadius, DIAL_TUNING_DEFAULTS.deadZoneRadius);
  assert.equal(MOTION_KNOB_DEFAULTS.dialFirstRingRadius, DIAL_TUNING_DEFAULTS.firstRingRadius);
  assert.equal(MOTION_KNOB_DEFAULTS.dialSecondRingRadius, DIAL_TUNING_DEFAULTS.secondRingRadius);
  assert.equal(MOTION_KNOB_DEFAULTS.dialBloomDurationMs, DIAL_TUNING_DEFAULTS.bloomDurationMs);
  assert.equal(MOTION_KNOB_DEFAULTS.dialBloomEasing, DIAL_TUNING_DEFAULTS.bloomEasing);
  assert.equal(MOTION_KNOB_DEFAULTS.dialDragHysteresis, DIAL_TUNING_DEFAULTS.dragHysteresis);
  assert.equal(MOTION_KNOB_DEFAULTS.dialScrimOpacity, DIAL_TUNING_DEFAULTS.scrimOpacity);
  assert.equal(MOTION_KNOB_DEFAULTS.dialFloatAmplitude, DIAL_TUNING_DEFAULTS.floatAmplitude);
  assert.equal(MOTION_KNOB_DEFAULTS.dialFloatPeriodMs, DIAL_TUNING_DEFAULTS.floatPeriodMs);
});

function assertDialRingsAreDisjoint() {
  const knobs = getMotionKnobs();
  const firstRingMax = knobs.dialFirstRingRadius + DIAL_BASE_PETAL_SIZE / 2;
  const secondRingMin = knobs.dialSecondRingRadius - DIAL_BASE_PETAL_SIZE / 2;
  assert.ok(secondRingMin >= firstRingMax + DIAL_RING_GAP);
}

test('dial ring knobs co-clamp at both extremes to keep hit bands disjoint', () => {
  globalWithDev.__DEV__ = true;
  resetMotionKnobs();

  setMotionKnob(
    'dialFirstRingRadius',
    MOTION_KNOB_BOUNDS.dialFirstRingRadius.max
  );
  assert.equal(
    getMotionKnobs().dialSecondRingRadius,
    MOTION_KNOB_BOUNDS.dialFirstRingRadius.max +
      DIAL_BASE_PETAL_SIZE +
      DIAL_RING_GAP
  );
  assertDialRingsAreDisjoint();

  setMotionKnob(
    'dialSecondRingRadius',
    MOTION_KNOB_BOUNDS.dialSecondRingRadius.min
  );
  assert.equal(
    getMotionKnobs().dialFirstRingRadius,
    MOTION_KNOB_BOUNDS.dialSecondRingRadius.min -
      DIAL_BASE_PETAL_SIZE -
      DIAL_RING_GAP
  );
  assertDialRingsAreDisjoint();

  resetMotionKnobs();
  globalWithDev.__DEV__ = false;
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

  setMotionKnob('dialScrimOpacity', 0);
  assert.equal(getMotionKnobs().dialScrimOpacity, MOTION_KNOB_BOUNDS.dialScrimOpacity.min);

  setMotionKnob('dialBloomEasing', 99);
  assert.equal(getMotionKnobs().dialBloomEasing, MOTION_KNOB_BOUNDS.dialBloomEasing.max);

  resetMotionKnobs();
  assert.deepEqual(getMotionKnobs(), MOTION_KNOB_DEFAULTS);

  unsubscribe();
  globalWithDev.__DEV__ = false;
});
