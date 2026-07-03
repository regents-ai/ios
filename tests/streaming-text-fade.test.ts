import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FADE_DURATION_MS,
  FADE_STAMP_SPACING_MS,
  FADE_WINDOW,
  advanceFadeStamps,
  fadeOpacity,
  isSettledWord,
} from '../utils/streamingTextFade';

test('a slow drip stamps each new word at its arrival time', () => {
  let stamps = advanceFadeStamps(new Map(), 1, 1000);
  assert.equal(stamps.get(0), 1000);

  stamps = advanceFadeStamps(stamps, 2, 2000);
  assert.equal(stamps.get(0), 1000, 'existing stamp stays put');
  assert.equal(stamps.get(1), 2000, 'new word stamped at now');
});

test('a fast burst compresses the chain so stamps space out, never bunching', () => {
  // Five words all arrive at the same instant.
  const stamps = advanceFadeStamps(new Map(), 5, 1000);
  const values = [0, 1, 2, 3, 4].map((index) => stamps.get(index)!);

  for (let index = 1; index < values.length; index += 1) {
    assert.equal(values[index] - values[index - 1], FADE_STAMP_SPACING_MS, 'evenly spaced');
  }
  assert.equal(values[0], 1000);
});

test('opacity ramps from 0 to 1 across the fade duration', () => {
  assert.equal(fadeOpacity(1000, 1000), 0, 'not started');
  assert.equal(fadeOpacity(1000, 999), 0, 'future stamp reads 0');
  assert.ok(fadeOpacity(1000, 1000 + FADE_DURATION_MS / 2) > 0.4);
  assert.equal(fadeOpacity(1000, 1000 + FADE_DURATION_MS), 1, 'fully faded in');
  assert.equal(fadeOpacity(1000, 5000), 1, 'clamped at 1');
});

test('only the last FADE_WINDOW words stay animated; the rest are absorbed', () => {
  const total = FADE_WINDOW + 3;
  assert.equal(isSettledWord(0, total), true, 'oldest word is solid');
  assert.equal(isSettledWord(2, total), true);
  assert.equal(isSettledWord(3, total), false, 'first word in the window animates');
  assert.equal(isSettledWord(total - 1, total), false, 'newest word animates');
});

test('short text never marks any word settled', () => {
  for (let index = 0; index < FADE_WINDOW; index += 1) {
    assert.equal(isSettledWord(index, FADE_WINDOW), false);
  }
});
