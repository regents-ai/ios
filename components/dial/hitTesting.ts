export const DIAL_ARC_START_ANGLE = Math.PI;
export const DIAL_ARC_END_ANGLE = Math.PI * 1.5;

export const DIAL_DEAD_ZONE_RADIUS = 48;
export const DIAL_FIRST_RING_MIN_RADIUS = 72;
export const DIAL_FIRST_RING_MAX_RADIUS = 144;
export const DIAL_FIRST_RING_RADIUS = 108;
export const DIAL_SECOND_RING_MIN_RADIUS = 148;
export const DIAL_SECOND_RING_MAX_RADIUS = 216;
export const DIAL_SECOND_RING_RADIUS = 182;

export type DialHitZone = 'petal' | 'dead-zone' | 'off-dial';

export type DialHitResult = {
  zone: DialHitZone;
  petalIndex: number | null;
};

export type DialRing = {
  minRadius: number;
  maxRadius: number;
};

export const FIRST_DIAL_RING: DialRing = {
  minRadius: DIAL_FIRST_RING_MIN_RADIUS,
  maxRadius: DIAL_FIRST_RING_MAX_RADIUS,
};

export const SECOND_DIAL_RING: DialRing = {
  minRadius: DIAL_SECOND_RING_MIN_RADIUS,
  maxRadius: DIAL_SECOND_RING_MAX_RADIUS,
};

function normalizeAngle(angle: number): number {
  const fullTurn = Math.PI * 2;
  return ((angle % fullTurn) + fullTurn) % fullTurn;
}

function circularDistance(a: number, b: number): number {
  const fullTurn = Math.PI * 2;
  const distance = Math.abs(normalizeAngle(a) - normalizeAngle(b));
  return Math.min(distance, fullTurn - distance);
}

export function getDialPetalAngle(index: number, petalCount: number): number {
  if (petalCount <= 0 || index < 0 || index >= petalCount) {
    throw new RangeError('Dial petal index must belong to a non-empty petal set.');
  }

  if (petalCount === 1) {
    return (DIAL_ARC_START_ANGLE + DIAL_ARC_END_ANGLE) / 2;
  }

  const progress = index / (petalCount - 1);
  return DIAL_ARC_START_ANGLE + (DIAL_ARC_END_ANGLE - DIAL_ARC_START_ANGLE) * progress;
}

export function getDialPetalPosition(index: number, petalCount: number, radius: number) {
  const angle = getDialPetalAngle(index, petalCount);
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
}

export function hitTestDialPetals(
  x: number,
  y: number,
  petalCount: number,
  ring: DialRing = FIRST_DIAL_RING
): DialHitResult {
  const radius = Math.hypot(x, y);

  if (radius <= DIAL_DEAD_ZONE_RADIUS) {
    return { zone: 'dead-zone', petalIndex: null };
  }

  if (
    petalCount <= 0 ||
    !Number.isFinite(radius) ||
    radius < ring.minRadius ||
    radius > ring.maxRadius
  ) {
    return { zone: 'off-dial', petalIndex: null };
  }

  const angle = Math.atan2(y, x);
  const step =
    petalCount === 1
      ? DIAL_ARC_END_ANGLE - DIAL_ARC_START_ANGLE
      : (DIAL_ARC_END_ANGLE - DIAL_ARC_START_ANGLE) / (petalCount - 1);
  const maximumAngularDistance = step / 2;

  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < petalCount; index += 1) {
    const distance = circularDistance(angle, getDialPetalAngle(index, petalCount));
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  }

  if (nearestDistance > maximumAngularDistance) {
    return { zone: 'off-dial', petalIndex: null };
  }

  return { zone: 'petal', petalIndex: nearestIndex };
}
