export const SWIPE_CONFIRM_THRESHOLD_RATIO = 0.8;

export type SwipeReleaseTarget = 'confirm' | 'reset';
export type SwipeReleaseMotion = 'instant' | 'timing' | 'spring';

export function getSwipeThreshold(maxX: number) {
  return Math.max(0, maxX) * SWIPE_CONFIRM_THRESHOLD_RATIO;
}

export function hasReachedSwipeThreshold(currentX: number, maxX: number) {
  return maxX > 0 && currentX >= getSwipeThreshold(maxX);
}

export function getSwipeReleaseMotion(reducedMotionEnabled: boolean, target: SwipeReleaseTarget): SwipeReleaseMotion {
  if (reducedMotionEnabled) {
    return 'instant';
  }

  return target === 'confirm' ? 'timing' : 'spring';
}
