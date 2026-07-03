import test from 'node:test';
import assert from 'node:assert/strict';

import { MOTION, RADIUS, SPACE, THEME_COLORS, TYPE } from '../theme/tokens';

test('both themes exist and are fully distinct grounds', () => {
  const { light, dark } = THEME_COLORS;
  assert.ok(light && dark);
  assert.notEqual(light.bg, dark.bg);
  assert.notEqual(light.text, dark.text);
});

test('dark ground is near-black, light ground is near-white (brand home is dark)', () => {
  assert.equal(THEME_COLORS.dark.bg, '#0a0a0a');
  assert.equal(THEME_COLORS.light.bg, '#fafafa');
});

test('neutral scale is hueless (no product hue in the ground/surfaces)', () => {
  // A hueless sRGB value has equal-ish R=G=B. Check the dark neutrals.
  for (const hex of [THEME_COLORS.dark.bg, THEME_COLORS.dark.surface, THEME_COLORS.dark.border, THEME_COLORS.dark.text]) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    assert.ok(Math.max(r, g, b) - Math.min(r, g, b) <= 2, `${hex} should be hueless`);
  }
});

test('accent is the regent blue and differs between light and dark', () => {
  assert.equal(THEME_COLORS.dark.accent, '#4ba8e0');
  assert.equal(THEME_COLORS.light.accent, '#005f92');
  assert.notEqual(THEME_COLORS.light.accent, THEME_COLORS.dark.accent);
});

test('hairlines are foreground-mixed translucent, not solid borders', () => {
  for (const theme of ['light', 'dark'] as const) {
    assert.match(THEME_COLORS[theme].hairline, /^rgba\(.*0\.14\)$/);
    assert.match(THEME_COLORS[theme].hairlineStrong, /^rgba\(.*0\.26\)$/);
  }
});

test('status colors are present in both themes (state only, never identity)', () => {
  for (const theme of ['light', 'dark'] as const) {
    const c = THEME_COLORS[theme];
    for (const role of ['success', 'error', 'warning', 'info'] as const) {
      assert.match(c[role], /^#[0-9a-f]{6}$/);
    }
  }
});

test('type, spacing, radius, motion scales match the design-system token values', () => {
  assert.deepEqual(TYPE.display, { size: 40, line: 48 });
  assert.deepEqual(TYPE.body, { size: 16, line: 24 });
  assert.equal(SPACE.s4, 16);
  assert.equal(SPACE.s7, 48);
  assert.equal(RADIUS.lg, 12);
  assert.equal(RADIUS.full, 9999);
  assert.equal(MOTION.durationBase, 200);
  assert.equal(MOTION.activeScale, 0.97);
  assert.deepEqual(MOTION.easeOut, [0.23, 1, 0.32, 1]);
});
