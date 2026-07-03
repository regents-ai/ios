import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveGlassSurface, type GlassSurfaceInputs } from '../utils/glassSurface';

const DARK_INPUTS: GlassSurfaceInputs = {
  tint: 'dark',
  surfaceRgb: '23, 23, 23',
  opaqueSurface: '#171717',
  stroke: 'rgba(245, 245, 245, 0.26)',
  contrastStroke: 'rgba(245, 245, 245, 0.4)',
};

const LIGHT_INPUTS: GlassSurfaceInputs = {
  tint: 'light',
  surfaceRgb: '253, 253, 253',
  opaqueSurface: '#fdfdfd',
  stroke: 'rgba(27, 27, 27, 0.26)',
  contrastStroke: 'rgba(27, 27, 27, 0.4)',
};

test('normal state resolves a real frosted blur that steps by level, using theme inputs', () => {
  const pill = resolveGlassSurface('pill', false, DARK_INPUTS);
  const sheet = resolveGlassSurface('sheet', false, DARK_INPUTS);

  assert.equal(pill.mode, 'blur');
  assert.equal(sheet.mode, 'blur');
  if (pill.mode !== 'blur' || sheet.mode !== 'blur') {
    return;
  }

  // A sheet floats heavier than a pill: stronger blur and wash.
  assert.ok(sheet.intensity > pill.intensity);
  assert.equal(pill.overlayColor, 'rgba(23, 23, 23, 0.55)');
  assert.equal(sheet.overlayColor, 'rgba(23, 23, 23, 0.7)');
  // Dark ground -> dark blur tint.
  assert.equal(pill.tint, 'dark');
  assert.equal(pill.borderColor, DARK_INPUTS.stroke);
  assert.equal(pill.borderWidth, 1);
});

test('light theme threads its own surface + light blur tint', () => {
  const pill = resolveGlassSurface('pill', false, LIGHT_INPUTS);
  assert.equal(pill.mode, 'blur');
  if (pill.mode !== 'blur') {
    return;
  }
  assert.equal(pill.tint, 'light');
  assert.equal(pill.overlayColor, 'rgba(253, 253, 253, 0.55)');
});

test('reduce transparency resolves tinted opaque with a contrast stroke, no blur', () => {
  const pill = resolveGlassSurface('pill', true, DARK_INPUTS);
  const sheet = resolveGlassSurface('sheet', true, DARK_INPUTS);

  assert.equal(pill.mode, 'opaque');
  assert.deepEqual(pill, sheet);
  if (pill.mode !== 'opaque') {
    return;
  }

  assert.equal(pill.backgroundColor, '#171717');
  assert.equal(pill.borderColor, DARK_INPUTS.contrastStroke);
  assert.equal(pill.borderWidth, 1);

  const blurred = resolveGlassSurface('pill', false, DARK_INPUTS);
  assert.notEqual(pill.borderColor, blurred.borderColor);
});
