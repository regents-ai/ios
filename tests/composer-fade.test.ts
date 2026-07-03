import test from 'node:test';
import assert from 'node:assert/strict';

import { COMPOSER_FADE_HEIGHT, composerFadeSlices } from '../utils/composerFade';

test('the mask ramps from transparent at the top to opaque at the bottom', () => {
  const slices = composerFadeSlices();
  assert.ok(slices.length > 1);

  assert.ok(slices[0].alpha < 0.2, 'top of the fade keeps content sharp');
  assert.equal(slices[slices.length - 1].alpha, 1, 'bottom fully dissolves into the composer');
});

test('the alpha ramp is monotonic and smooth (no banding jumps)', () => {
  const slices = composerFadeSlices();
  for (let index = 1; index < slices.length; index += 1) {
    assert.ok(slices[index].alpha > slices[index - 1].alpha, 'strictly increasing');
    const step = slices[index].alpha - slices[index - 1].alpha;
    assert.ok(step <= 0.2, 'no hard banding edge between slices');
  }
});

test('slice count is configurable and keeps unique keys', () => {
  const slices = composerFadeSlices(6);
  assert.equal(slices.length, 6);
  assert.equal(new Set(slices.map((slice) => slice.key)).size, 6);
});

test('the fade reserves a fixed height', () => {
  assert.equal(typeof COMPOSER_FADE_HEIGHT, 'number');
  assert.ok(COMPOSER_FADE_HEIGHT > 0);
});
