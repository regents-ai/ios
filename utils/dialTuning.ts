import {
  DIAL_BASE_PETAL_SIZE,
  DIAL_BLOOM_EASINGS,
  DIAL_MAX_PETAL_SIZE,
  DIAL_SELECTION_HAPTIC_MIN_INTERVAL_MS,
} from '@/utils/dialConstants';

export type DialPoint = {
  x: number;
  y: number;
};

export function getDialBloomEasing(index: number): readonly [number, number, number, number] {
  return DIAL_BLOOM_EASINGS[Math.round(index)]?.bezier ?? DIAL_BLOOM_EASINGS[0].bezier;
}

export function getDialBloomEasingLabel(index: number): string {
  return DIAL_BLOOM_EASINGS[Math.round(index)]?.label ?? DIAL_BLOOM_EASINGS[0].label;
}

export function shouldChangeDialHighlight(
  currentCenter: DialPoint,
  candidateCenter: DialPoint,
  pointer: DialPoint,
  threshold: number
): boolean {
  if (threshold <= 0) {
    return true;
  }

  const currentDistance = Math.hypot(pointer.x - currentCenter.x, pointer.y - currentCenter.y);
  const candidateDistance = Math.hypot(
    pointer.x - candidateCenter.x,
    pointer.y - candidateCenter.y
  );
  return candidateDistance + threshold <= currentDistance;
}

export function shouldRunDialSelectionHaptic(
  lastRunAt: number | null,
  now: number,
  minimumIntervalMs = DIAL_SELECTION_HAPTIC_MIN_INTERVAL_MS
): boolean {
  return lastRunAt === null || now - lastRunAt >= minimumIntervalMs;
}

export function getDialPetalSize(fontScale: number): number {
  if (!Number.isFinite(fontScale) || fontScale <= 1) {
    return DIAL_BASE_PETAL_SIZE;
  }

  return Math.min(
    DIAL_MAX_PETAL_SIZE,
    Math.round(DIAL_BASE_PETAL_SIZE + (fontScale - 1) * 42)
  );
}
