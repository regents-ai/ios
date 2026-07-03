import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_LAYOUT_FONT_SCALE,
  STACK_FONT_SCALE,
  resolveDynamicTypeLayout,
  scaleSpacing,
} from '../utils/dynamicTypeLayout';

test('normal font sizes keep the horizontal row layout', () => {
  assert.equal(resolveDynamicTypeLayout(1).direction, 'row');
  assert.equal(resolveDynamicTypeLayout(1.2).direction, 'row');
});

test('accessibility font sizes switch to a stacked layout', () => {
  assert.equal(resolveDynamicTypeLayout(STACK_FONT_SCALE).direction, 'stacked');
  assert.equal(resolveDynamicTypeLayout(2).direction, 'stacked');
});

test('spacing scales with font size but is clamped', () => {
  assert.equal(resolveDynamicTypeLayout(1).spacingScale, 1);
  assert.equal(resolveDynamicTypeLayout(1.4).spacingScale, 1.4);
  assert.equal(resolveDynamicTypeLayout(3).spacingScale, MAX_LAYOUT_FONT_SCALE, 'clamped up top');
  assert.equal(resolveDynamicTypeLayout(0.8).spacingScale, 1, 'never shrinks below base');
});

test('bad font-scale values fall back to the row layout at base spacing', () => {
  const nan = resolveDynamicTypeLayout(Number.NaN);
  assert.equal(nan.direction, 'row');
  assert.equal(nan.spacingScale, 1);
  assert.equal(resolveDynamicTypeLayout(0).direction, 'row');
});

test('scaleSpacing multiplies and rounds base spacing', () => {
  const stacked = resolveDynamicTypeLayout(1.5);
  assert.equal(scaleSpacing(12, stacked), 18);
  assert.equal(scaleSpacing(8, resolveDynamicTypeLayout(1)), 8);
});
