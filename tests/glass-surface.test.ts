import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveGlassSurface } from '../utils/glassSurface';

test('translucent rung tints by level and keeps a stroke', () => {
  const pill = resolveGlassSurface('pill', false);
  const sheet = resolveGlassSurface('sheet', false);

  assert.match(pill.backgroundColor, /^rgba\(242, 233, 208, 0\.88\)$/);
  assert.match(sheet.backgroundColor, /^rgba\(242, 233, 208, 0\.96\)$/);
  assert.equal(pill.borderWidth, 1);
  assert.equal(pill.borderColor, sheet.borderColor);
});

test('reduce transparency resolves tinted opaque with a contrast stroke', () => {
  const pill = resolveGlassSurface('pill', true);
  const sheet = resolveGlassSurface('sheet', true);

  assert.equal(pill.backgroundColor, '#F2E9D0');
  assert.deepEqual(pill, sheet);
  assert.notEqual(pill.borderColor, resolveGlassSurface('pill', false).borderColor);
  assert.equal(pill.borderWidth, 1);
});
