import {
  DIAL_BASE_PETAL_SIZE,
  DIAL_CENTER_SIZE,
  DIAL_MINIMUM_CENTER_COORDINATE,
  DIAL_RING_GAP,
  DIAL_TUNING_DEFAULTS,
} from '@/utils/dialConstants';

export const DIAL_ARC_START_ANGLE = Math.PI;
export const DIAL_ARC_END_ANGLE = Math.PI * 1.5;

export const DIAL_DEAD_ZONE_RADIUS = DIAL_TUNING_DEFAULTS.deadZoneRadius;
export const DIAL_FIRST_RING_RADIUS = DIAL_TUNING_DEFAULTS.firstRingRadius;
export const DIAL_SECOND_RING_RADIUS = DIAL_TUNING_DEFAULTS.secondRingRadius;
export const DIAL_FIRST_RING_MIN_RADIUS =
  DIAL_FIRST_RING_RADIUS - DIAL_BASE_PETAL_SIZE / 2;
export const DIAL_FIRST_RING_MAX_RADIUS =
  DIAL_FIRST_RING_RADIUS + DIAL_BASE_PETAL_SIZE / 2;
export const DIAL_SECOND_RING_MIN_RADIUS =
  DIAL_SECOND_RING_RADIUS - DIAL_BASE_PETAL_SIZE / 2;
export const DIAL_SECOND_RING_MAX_RADIUS =
  DIAL_SECOND_RING_RADIUS + DIAL_BASE_PETAL_SIZE / 2;

export type DialHitZone = 'petal' | 'dead-zone' | 'off-dial';

export type DialHitResult = {
  zone: DialHitZone;
  petalIndex: number | null;
};

export type DialRing = {
  minRadius: number;
  maxRadius: number;
  angleStep?: number;
};

export type DialRingLayout = DialRing & {
  angleStep: number;
  petalSize: number;
  radius: number;
};

type DialViewportGeometryOptions = {
  bottomOffset: number;
  desiredPetalSize: number;
  firstPetalCount: number;
  firstRingRadius: number;
  floatAmplitude: number;
  rightOffset: number;
  secondPetalCount: number;
  secondRingRadius: number;
  viewportHeight: number;
  viewportWidth: number;
};

export const FIRST_DIAL_RING: DialRing = {
  minRadius: DIAL_FIRST_RING_MIN_RADIUS,
  maxRadius: DIAL_FIRST_RING_MAX_RADIUS,
};

export const SECOND_DIAL_RING: DialRing = {
  minRadius: DIAL_SECOND_RING_MIN_RADIUS,
  maxRadius: DIAL_SECOND_RING_MAX_RADIUS,
};

function baseAngleStep(petalCount: number): number {
  const arc = DIAL_ARC_END_ANGLE - DIAL_ARC_START_ANGLE;
  return petalCount <= 1 ? arc : arc / (petalCount - 1);
}

function minimumRadiusForPetals(petalSize: number, petalCount: number): number {
  if (petalCount <= 1) {
    return 0;
  }

  return petalSize / (2 * Math.sin(baseAngleStep(petalCount) / 2));
}

function getDialRingLayout(
  configuredRadius: number,
  petalSize: number,
  petalCount: number,
  minimumRadius = 0
): DialRingLayout {
  const radius = Math.max(
    configuredRadius,
    minimumRadius,
    minimumRadiusForPetals(petalSize, petalCount)
  );
  const minimumAngleStep =
    petalCount <= 1
      ? baseAngleStep(petalCount)
      : 2 * Math.asin(Math.min(1, petalSize / (2 * radius)));
  const angleStep = Math.max(baseAngleStep(petalCount), minimumAngleStep);

  return {
    angleStep,
    minRadius: radius - petalSize / 2,
    maxRadius: radius + petalSize / 2,
    petalSize,
    radius,
  };
}

export function getDialLayouts(
  firstRadius: number,
  secondRadius: number,
  petalSize: number,
  firstPetalCount: number,
  secondPetalCount: number
) {
  const first = getDialRingLayout(firstRadius, petalSize, firstPetalCount);
  const secondMinimumRadius =
    first.maxRadius + DIAL_RING_GAP + petalSize / 2;
  const second = getDialRingLayout(
    secondRadius,
    petalSize,
    secondPetalCount,
    secondMinimumRadius
  );

  return { first, second };
}

function getDialGeometry(
  options: DialViewportGeometryOptions,
  petalSize: number
) {
  const layouts = getDialLayouts(
    options.firstRingRadius,
    options.secondRingRadius,
    petalSize,
    options.firstPetalCount,
    options.secondPetalCount
  );
  const floatExtent = Math.abs(options.floatAmplitude);
  const centerCoordinate = Math.max(
    DIAL_MINIMUM_CENTER_COORDINATE,
    layouts.second.maxRadius + floatExtent
  );
  const trailingExtent = Math.max(
    DIAL_CENTER_SIZE / 2,
    petalSize / 2 + floatExtent
  );

  return {
    canvasSize: centerCoordinate + trailingExtent,
    centerCoordinate,
    layouts,
    petalSize,
  };
}

export function resolveDialViewportGeometry(
  options: DialViewportGeometryOptions
) {
  const desiredPetalSize = Math.max(
    DIAL_BASE_PETAL_SIZE,
    Math.floor(options.desiredPetalSize)
  );
  const availableCanvasSize = Math.max(
    0,
    Math.min(
      options.viewportWidth - options.rightOffset,
      options.viewportHeight - options.bottomOffset
    )
  );

  for (
    let petalSize = desiredPetalSize;
    petalSize > DIAL_BASE_PETAL_SIZE;
    petalSize -= 1
  ) {
    const geometry = getDialGeometry(options, petalSize);
    if (geometry.canvasSize <= availableCanvasSize) {
      return {
        ...geometry,
        availableCanvasSize,
        growthCapped: petalSize < desiredPetalSize,
      };
    }
  }

  return {
    ...getDialGeometry(options, DIAL_BASE_PETAL_SIZE),
    availableCanvasSize,
    growthCapped: desiredPetalSize > DIAL_BASE_PETAL_SIZE,
  };
}

function normalizeAngle(angle: number): number {
  const fullTurn = Math.PI * 2;
  return ((angle % fullTurn) + fullTurn) % fullTurn;
}

function circularDistance(a: number, b: number): number {
  const fullTurn = Math.PI * 2;
  const distance = Math.abs(normalizeAngle(a) - normalizeAngle(b));
  return Math.min(distance, fullTurn - distance);
}

export function getDialPetalAngle(
  index: number,
  petalCount: number,
  angleStep = baseAngleStep(petalCount)
): number {
  if (petalCount <= 0 || index < 0 || index >= petalCount) {
    throw new RangeError('Dial petal index must belong to a non-empty petal set.');
  }

  if (petalCount === 1) {
    return (DIAL_ARC_START_ANGLE + DIAL_ARC_END_ANGLE) / 2;
  }

  const arcCenter = (DIAL_ARC_START_ANGLE + DIAL_ARC_END_ANGLE) / 2;
  return arcCenter - (angleStep * (petalCount - 1)) / 2 + angleStep * index;
}

export function getDialPetalPosition(
  index: number,
  petalCount: number,
  radius: number,
  angleStep?: number
) {
  const angle = getDialPetalAngle(index, petalCount, angleStep);
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
}

export function hitTestDialPetals(
  x: number,
  y: number,
  petalCount: number,
  ring: DialRing = FIRST_DIAL_RING,
  deadZoneRadius: number = DIAL_DEAD_ZONE_RADIUS
): DialHitResult {
  const radius = Math.hypot(x, y);

  if (radius <= deadZoneRadius) {
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
  const step = ring.angleStep ?? baseAngleStep(petalCount);
  const maximumAngularDistance = step / 2;

  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < petalCount; index += 1) {
    const distance = circularDistance(
      angle,
      getDialPetalAngle(index, petalCount, step)
    );
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
