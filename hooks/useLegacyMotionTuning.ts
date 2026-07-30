import { useSyncExternalStore } from 'react';

import {
  LEGACY_MOTION_TUNING_DEFAULTS,
  type LegacyMotionTuning,
} from '@/utils/legacyMotionConstants';

declare const __DEV__: boolean | undefined;

const subscribeToFrozenTuning = (_listener: () => void): (() => void) =>
  () => undefined;
const getFrozenTuning = () => LEGACY_MOTION_TUNING_DEFAULTS;

function isDevBuild(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__ === true;
}

export function useLegacyMotionTuning(): Readonly<LegacyMotionTuning> {
  let subscribe = subscribeToFrozenTuning;
  let getSnapshot: () => Readonly<LegacyMotionTuning> = getFrozenTuning;

  if (isDevBuild()) {
    // The mutable store is required only behind the development gate so
    // release evaluation and rendering never construct or subscribe to it.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const store = require('@/utils/motionKnobs') as typeof import('@/utils/motionKnobs');
    subscribe = store.subscribeMotionKnobs;
    getSnapshot = store.getMotionKnobs;
  }

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
