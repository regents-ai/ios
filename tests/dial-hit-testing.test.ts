import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DIAL_DEAD_ZONE_RADIUS,
  DIAL_FIRST_RING_MAX_RADIUS,
  DIAL_FIRST_RING_RADIUS,
  getDialPetalPosition,
  hitTestDialPetals,
} from '../components/dial/hitTesting';

test('dial hit-testing resolves each default petal by angle and radius', () => {
  for (let index = 0; index < 5; index += 1) {
    const point = getDialPetalPosition(index, 5, DIAL_FIRST_RING_RADIUS);
    assert.deepEqual(hitTestDialPetals(point.x, point.y, 5), {
      zone: 'petal',
      petalIndex: index,
    });
  }
});

test('dial hit-testing keeps the center as a cancellation dead zone', () => {
  assert.deepEqual(hitTestDialPetals(0, 0, 4), {
    zone: 'dead-zone',
    petalIndex: null,
  });
  assert.deepEqual(hitTestDialPetals(DIAL_DEAD_ZONE_RADIUS, 0, 4), {
    zone: 'dead-zone',
    petalIndex: null,
  });
});

test('dial hit-testing cancels outside the ring and outside the petal arc', () => {
  assert.deepEqual(hitTestDialPetals(DIAL_FIRST_RING_MAX_RADIUS + 1, 0, 4), {
    zone: 'off-dial',
    petalIndex: null,
  });
  assert.deepEqual(hitTestDialPetals(DIAL_FIRST_RING_RADIUS, 0, 4), {
    zone: 'off-dial',
    petalIndex: null,
  });
  assert.deepEqual(hitTestDialPetals(Number.NaN, 0, 4), {
    zone: 'off-dial',
    petalIndex: null,
  });
});
