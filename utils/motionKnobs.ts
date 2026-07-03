/**
 * Motion knobs: live-tunable motion values for the Motion Lab.
 *
 * Adapted from hermex StreamingLabView.swift. In debug builds the knobs are
 * a mutable store the Motion Lab screen can tune while the real motion
 * pipeline (word drain, toast entry) reads live values. In release builds
 * every read returns the frozen defaults and writes are ignored, so shipped
 * motion is compile-time constant.
 */

declare const __DEV__: boolean | undefined;

import { WORD_DRAIN_CADENCE_MS, WORD_DRAIN_MAX_LAG_MS } from '@/utils/streamingWordDrain';

export type MotionKnobs = {
  /** Word-drain steady pace, ms per word tick. */
  wordDrainCadenceMs: number;
  /** Word-drain lag bound, ms a backlog may trail the source. */
  wordDrainMaxLagMs: number;
  /** Toast entry animation duration, ms. */
  toastEntryMs: number;
};

export const MOTION_KNOB_DEFAULTS: Readonly<MotionKnobs> = Object.freeze({
  wordDrainCadenceMs: WORD_DRAIN_CADENCE_MS,
  wordDrainMaxLagMs: WORD_DRAIN_MAX_LAG_MS,
  toastEntryMs: 260,
});

export const MOTION_KNOB_BOUNDS: Readonly<Record<keyof MotionKnobs, { min: number; max: number; step: number }>> =
  Object.freeze({
    wordDrainCadenceMs: { min: 16, max: 200, step: 8 },
    wordDrainMaxLagMs: { min: 400, max: 8000, step: 200 },
    toastEntryMs: { min: 80, max: 800, step: 40 },
  });

function isDevBuild(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__ === true;
}

let current: MotionKnobs = { ...MOTION_KNOB_DEFAULTS };
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
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
  if (current[key] === clamped) {
    return;
  }

  current = { ...current, [key]: clamped };
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
