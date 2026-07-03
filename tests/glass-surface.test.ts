import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveGlassSurface } from '../utils/glassSurface';

test('normal state resolves a real frosted blur that steps by level', () => {
  const pill = resolveGlassSurface('pill', false);
  const sheet = resolveGlassSurface('sheet', false);

  assert.equal(pill.mode, 'blur');
  assert.equal(sheet.mode, 'blur');
  if (pill.mode !== 'blur' || sheet.mode !== 'blur') {
    return;
  }

  // A sheet floats heavier than a pill: stronger blur and wash.
  assert.ok(sheet.intensity > pill.intensity);
  assert.match(pill.overlayColor, /^rgba\(242, 233, 208, 0\.55\)$/);
  assert.match(sheet.overlayColor, /^rgba\(242, 233, 208, 0\.7\)$/);
  assert.equal(pill.tint, 'light');
  assert.equal(pill.borderWidth, 1);
  assert.equal(pill.borderColor, sheet.borderColor);
});

test('reduce transparency resolves tinted opaque with a contrast stroke, no blur', () => {
  const pill = resolveGlassSurface('pill', true);
  const sheet = resolveGlassSurface('sheet', true);

  assert.equal(pill.mode, 'opaque');
  assert.deepEqual(pill, sheet);
  if (pill.mode !== 'opaque') {
    return;
  }

  assert.equal(pill.backgroundColor, '#F2E9D0');
  assert.equal(pill.borderWidth, 1);

  const blurred = resolveGlassSurface('pill', false);
  assert.notEqual(pill.borderColor, blurred.borderColor);
});
