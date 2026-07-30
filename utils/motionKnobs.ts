/**
 * Motion knobs: live-tunable motion values for the Motion Lab.
 *
 * Adapted from hermex StreamingLabView.swift. In debug builds the knobs are
 * a mutable store the Motion Lab screen can tune while the real motion
 * pipeline (word drain, toast entry) reads live values. In release builds
 * every read returns the frozen defaults and writes are ignored, so shipped
 * motion is compile-time constant.
 */

import {
  DIAL_BASE_PETAL_SIZE,
  DIAL_RING_GAP,
  DIAL_TUNING_DEFAULTS,
} from '@/utils/dialConstants';
import { LEGACY_MOTION_TUNING_DEFAULTS } from '@/utils/legacyMotionConstants';

declare const __DEV__: boolean | undefined;

const DIAL_FIRST_RING_RADIUS_MIN = 88;

export type MotionKnobs = {
  /** Word-drain steady pace, ms per word tick. */
  wordDrainCadenceMs: number;
  /** Word-drain lag bound, ms a backlog may trail the source. */
  wordDrainMaxLagMs: number;
  /** Toast entry animation duration, ms. */
  toastEntryMs: number;
  /** Radius that keeps center drags out of the petal rings. */
  dialDeadZoneRadius: number;
  /** First-ring petal radius from the center button. */
  dialFirstRingRadius: number;
  /** Second-ring petal radius from the center button. */
  dialSecondRingRadius: number;
  /** Petal bloom and crossfade duration, ms. */
  dialBloomDurationMs: number;
  /** Index into the dial bloom easing choices. */
  dialBloomEasing: number;
  /** Extra distance required before a neighboring petal takes highlight. */
  dialDragHysteresis: number;
  /** Maximum expanded scrim opacity. */
  dialScrimOpacity: number;
  /** Vertical petal float amplitude. */
  dialFloatAmplitude: number;
  /** Duration of one petal float cycle, ms. */
  dialFloatPeriodMs: number;
};

export const MOTION_KNOB_DEFAULTS: Readonly<MotionKnobs> = Object.freeze({
  ...LEGACY_MOTION_TUNING_DEFAULTS,
  dialDeadZoneRadius: DIAL_TUNING_DEFAULTS.deadZoneRadius,
  dialFirstRingRadius: DIAL_TUNING_DEFAULTS.firstRingRadius,
  dialSecondRingRadius: DIAL_TUNING_DEFAULTS.secondRingRadius,
  dialBloomDurationMs: DIAL_TUNING_DEFAULTS.bloomDurationMs,
  dialBloomEasing: DIAL_TUNING_DEFAULTS.bloomEasing,
  dialDragHysteresis: DIAL_TUNING_DEFAULTS.dragHysteresis,
  dialScrimOpacity: DIAL_TUNING_DEFAULTS.scrimOpacity,
  dialFloatAmplitude: DIAL_TUNING_DEFAULTS.floatAmplitude,
  dialFloatPeriodMs: DIAL_TUNING_DEFAULTS.floatPeriodMs,
});

export const MOTION_KNOB_BOUNDS: Readonly<Record<keyof MotionKnobs, { min: number; max: number; step: number }>> =
  Object.freeze({
    wordDrainCadenceMs: { min: 16, max: 200, step: 8 },
    wordDrainMaxLagMs: { min: 400, max: 8000, step: 200 },
    toastEntryMs: { min: 80, max: 800, step: 40 },
    dialDeadZoneRadius: { min: 24, max: 72, step: 4 },
    dialFirstRingRadius: { min: DIAL_FIRST_RING_RADIUS_MIN, max: 132, step: 4 },
    dialSecondRingRadius: {
      min:
        DIAL_FIRST_RING_RADIUS_MIN +
        DIAL_BASE_PETAL_SIZE +
        DIAL_RING_GAP,
      max: 216,
      step: 4,
    },
    dialBloomDurationMs: { min: 80, max: 480, step: 20 },
    dialBloomEasing: { min: 0, max: 2, step: 1 },
    dialDragHysteresis: { min: 0, max: 24, step: 2 },
    dialScrimOpacity: { min: 0.4, max: 1, step: 0.05 },
    dialFloatAmplitude: { min: 0, max: 8, step: 1 },
    dialFloatPeriodMs: { min: 800, max: 6000, step: 200 },
  });

function isDevBuild(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__ === true;
}

let current: MotionKnobs = { ...MOTION_KNOB_DEFAULTS };
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

function enforceDialRingSeparation(
  next: MotionKnobs,
  changedKey: keyof MotionKnobs
): MotionKnobs {
  const minimumCenterSpacing = DIAL_BASE_PETAL_SIZE + DIAL_RING_GAP;

  if (changedKey === 'dialFirstRingRadius') {
    return {
      ...next,
      dialSecondRingRadius: Math.max(
        next.dialSecondRingRadius,
        next.dialFirstRingRadius + minimumCenterSpacing
      ),
    };
  }

  if (changedKey === 'dialSecondRingRadius') {
    return {
      ...next,
      dialFirstRingRadius: Math.min(
        next.dialFirstRingRadius,
        next.dialSecondRingRadius - minimumCenterSpacing
      ),
    };
  }

  return next;
}

/** Live values in debug builds; always the frozen defaults in release. */
export function getMotionKnobs(): Readonly<MotionKnobs> {
  return isDevBuild() ? current : MOTION_KNOB_DEFAULTS;
}

/** Debug-only write, clamped to the knob's bounds. A release no-op. */
export function setMotionKnob(key: keyof MotionKnobs, value: number): void {
  if (!isDevBuild()) {
    return;
  }

  const bounds = MOTION_KNOB_BOUNDS[key];
  const clamped = Math.min(bounds.max, Math.max(bounds.min, value));
  const next = enforceDialRingSeparation(
    { ...current, [key]: clamped },
    key
  );
  if (
    next[key] === current[key] &&
    next.dialFirstRingRadius === current.dialFirstRingRadius &&
    next.dialSecondRingRadius === current.dialSecondRingRadius
  ) {
    return;
  }

  current = next;
  notify();
}

/** Debug-only reset to the shipped defaults. */
export function resetMotionKnobs(): void {
  if (!isDevBuild()) {
    return;
  }

  current = { ...MOTION_KNOB_DEFAULTS };
  notify();
}

export function subscribeMotionKnobs(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
