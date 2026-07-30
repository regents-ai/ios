export const DIAL_BASE_PETAL_SIZE = 64;
export const DIAL_MAX_PETAL_SIZE = 152;
export const DIAL_CENTER_SIZE = 64;
export const DIAL_MINIMUM_CENTER_COORDINATE = 220;
export const DIAL_RING_GAP = 4;
export const DIAL_SELECTION_HAPTIC_MIN_INTERVAL_MS = 90;

export const DIAL_BLOOM_EASINGS = [
  { label: 'Ease out', bezier: [0.23, 1, 0.32, 1] },
  { label: 'Ease in/out', bezier: [0.77, 0, 0.175, 1] },
  { label: 'Linear', bezier: [0, 0, 1, 1] },
] as const;

export type DialTuning = {
  deadZoneRadius: number;
  firstRingRadius: number;
  secondRingRadius: number;
  bloomDurationMs: number;
  bloomEasing: number;
  dragHysteresis: number;
  scrimOpacity: number;
  floatAmplitude: number;
  floatPeriodMs: number;
};

export const DIAL_TUNING_DEFAULTS: Readonly<DialTuning> = Object.freeze({
  deadZoneRadius: 48,
  firstRingRadius: 108,
  secondRingRadius: 182,
  bloomDurationMs: 200,
  bloomEasing: 0,
  dragHysteresis: 8,
  scrimOpacity: 1,
  floatAmplitude: 3,
  floatPeriodMs: 2400,
});
