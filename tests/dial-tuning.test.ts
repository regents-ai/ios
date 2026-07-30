import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveDialViewportGeometry } from '../components/dial/hitTesting';
import { DIAL_SELECTION_HAPTIC_MIN_INTERVAL_MS } from '../utils/dialConstants';
import {
  getDialBloomEasing,
  getDialBloomEasingLabel,
  getDialPetalSize,
  shouldChangeDialHighlight,
  shouldRunDialSelectionHaptic,
} from '../utils/dialTuning';

test('dial bloom easing selection resolves each supported choice and falls back safely', () => {
  assert.deepEqual(getDialBloomEasing(0), [0.23, 1, 0.32, 1]);
  assert.equal(getDialBloomEasingLabel(1), 'Ease in/out');
  assert.equal(getDialBloomEasingLabel(2), 'Linear');
  assert.deepEqual(getDialBloomEasing(99), getDialBloomEasing(0));
});

test('drag hysteresis keeps the current highlight near a shared boundary', () => {
  const current = { x: 0, y: 0 };
  const candidate = { x: 20, y: 0 };

  assert.equal(
    shouldChangeDialHighlight(current, candidate, { x: 11, y: 0 }, 4),
    false
  );
  assert.equal(
    shouldChangeDialHighlight(current, candidate, { x: 13, y: 0 }, 4),
    true
  );
  assert.equal(
    shouldChangeDialHighlight(current, candidate, { x: 10, y: 0 }, 0),
    true
  );
});

test('selection haptics allow the first tick and rate-limit rapid highlight changes', () => {
  assert.equal(shouldRunDialSelectionHaptic(null, 1_000), true);
  assert.equal(
    shouldRunDialSelectionHaptic(1_000, 1_000 + DIAL_SELECTION_HAPTIC_MIN_INTERVAL_MS - 1),
    false
  );
  assert.equal(
    shouldRunDialSelectionHaptic(1_000, 1_000 + DIAL_SELECTION_HAPTIC_MIN_INTERVAL_MS),
    true
  );
});

test('petals grow for the largest accessibility text size without unbounded geometry', () => {
  assert.equal(getDialPetalSize(1), 64);
  assert.equal(getDialPetalSize(3.1), 152);
  assert.equal(getDialPetalSize(Number.NaN), 64);
  assert.equal(getDialPetalSize(10), 152);
});

test('petal growth is capped only when the full bloom cannot fit the viewport', () => {
  const options = {
    bottomOffset: 392,
    desiredPetalSize: getDialPetalSize(3.1),
    firstPetalCount: 5,
    firstRingRadius: 108,
    floatAmplitude: 3,
    rightOffset: 16,
    secondPetalCount: 1,
    secondRingRadius: 182,
    viewportHeight: 1_200,
    viewportWidth: 1_000,
  };
  const fullGrowth = resolveDialViewportGeometry(options);
  assert.equal(fullGrowth.petalSize, 152);
  assert.equal(fullGrowth.growthCapped, false);

  const exactFit = resolveDialViewportGeometry({
    ...options,
    viewportHeight: fullGrowth.canvasSize + options.bottomOffset,
    viewportWidth: fullGrowth.canvasSize + options.rightOffset,
  });
  assert.equal(exactFit.petalSize, 152);
  assert.equal(exactFit.growthCapped, false);

  const constrained = resolveDialViewportGeometry({
    ...options,
    viewportHeight: fullGrowth.canvasSize + options.bottomOffset - 1,
    viewportWidth: fullGrowth.canvasSize + options.rightOffset - 1,
  });
  assert.equal(constrained.growthCapped, true);
  assert.ok(constrained.petalSize < 152);
  assert.ok(constrained.canvasSize <= constrained.availableCanvasSize);
});
