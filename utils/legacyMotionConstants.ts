import {
  WORD_DRAIN_CADENCE_MS,
  WORD_DRAIN_MAX_LAG_MS,
} from '@/utils/streamingWordDrain';

export type LegacyMotionTuning = {
  wordDrainCadenceMs: number;
  wordDrainMaxLagMs: number;
  toastEntryMs: number;
};

export const LEGACY_MOTION_TUNING_DEFAULTS: Readonly<LegacyMotionTuning> =
  Object.freeze({
    wordDrainCadenceMs: WORD_DRAIN_CADENCE_MS,
    wordDrainMaxLagMs: WORD_DRAIN_MAX_LAG_MS,
    toastEntryMs: 260,
  });
