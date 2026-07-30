import type { ReactElement } from 'react';

import { LEGACY_MOTION_TUNING_DEFAULTS } from '@/utils/legacyMotionConstants';
import { splitAtUnitBoundary } from '@/utils/streamingWordDrain';

type ProbeResult = {
  intervalDelayMs: number | undefined;
  revealedText: string | undefined;
  storeConstructed: boolean;
  storeSubscriptions: number;
  toastEntryMs: number | undefined;
};

const theme = {
  colors: {
    accent: '#2563eb',
    success: '#16a34a',
    text: '#ffffff',
  },
  fonts: { ui: 'System' },
  type: {
    caption: { line: 16 },
    label: { size: 14 },
  },
};

const sourceText = Array.from(
  { length: 100 },
  (_, index) => `word${index}`
).join(' ');

function probeConsumers(
  dev: boolean,
  tuning: {
    wordDrainCadenceMs: number;
    wordDrainMaxLagMs: number;
    toastEntryMs: number;
  }
): ProbeResult {
  const globalWithDev = globalThis as { __DEV__?: boolean };
  let intervalCallback: (() => void) | undefined;
  let intervalDelayMs: number | undefined;
  let revealedText: string | undefined;
  let storeConstructed = false;
  let storeSubscriptions = 0;
  let toastEntryMs: number | undefined;

  globalWithDev.__DEV__ = dev;

  jest.isolateModules(() => {
    jest.doMock('react', () => {
      const actual = jest.requireActual<typeof import('react')>('react');
      return {
        ...actual,
        useEffect: (effect: () => void | (() => void)) => {
          effect();
        },
        useMemo: <T,>(factory: () => T) => factory(),
        useRef: <T,>(value: T) => ({ current: value }),
        useState: (initializer: unknown) => {
          const initial =
            typeof initializer === 'function'
              ? (initializer as () => unknown)()
              : initializer;
          return [
            initial,
            (value: unknown) => {
              revealedText = value as string;
            },
          ];
        },
        useSyncExternalStore: (
          subscribe: (listener: () => void) => () => void,
          getSnapshot: () => unknown
        ) => {
          subscribe(() => undefined);
          return getSnapshot();
        },
      };
    });
    jest.doMock('@/components/motion/useReducedMotion', () => ({
      useReducedMotion: () => false,
    }));
    jest.doMock('@/theme/ThemeProvider', () => ({
      useTheme: () => theme,
    }));
    jest.doMock('@/utils/motionKnobs', () => {
      storeConstructed = true;
      const store =
        jest.requireActual<typeof import('@/utils/motionKnobs')>(
          '@/utils/motionKnobs'
        );
      if (dev) {
        store.resetMotionKnobs();
        store.setMotionKnob('wordDrainCadenceMs', tuning.wordDrainCadenceMs);
        store.setMotionKnob('wordDrainMaxLagMs', tuning.wordDrainMaxLagMs);
        store.setMotionKnob('toastEntryMs', tuning.toastEntryMs);
      }
      return {
        ...store,
        subscribeMotionKnobs: (listener: () => void) => {
          storeSubscriptions += 1;
          return store.subscribeMotionKnobs(listener);
        },
      };
    });

    const intervalSpy = jest
      .spyOn(globalThis, 'setInterval')
      .mockImplementation((handler: TimerHandler, delay?: number) => {
        intervalCallback = handler as () => void;
        intervalDelayMs = delay;
        return 1 as unknown as ReturnType<typeof setInterval>;
      });

    const { Animated } =
      jest.requireActual<typeof import('react-native')>('react-native');
    const timingSpy = jest.spyOn(Animated, 'timing').mockImplementation((_value, config) => {
      toastEntryMs = config.duration;
      return { start: jest.fn() } as unknown as ReturnType<typeof Animated.timing>;
    });

    const { useWordDrain } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('@/hooks/useWordDrain') as typeof import('@/hooks/useWordDrain');
    useWordDrain(sourceText, true);
    intervalCallback?.();

    const { ProgressToast } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('@/components/ui/ProgressToast') as typeof import('@/components/ui/ProgressToast');
    const pill = ProgressToast({
      toast: {
        id: 1,
        phase: 'progress',
        label: 'Working',
        dismissAtMs: null,
      },
      onDismiss: jest.fn(),
    }) as ReactElement;
    (pill.type as (props: unknown) => ReactElement)(pill.props);

    intervalSpy.mockRestore();
    timingSpy.mockRestore();
  });

  jest.dontMock('react');
  jest.dontMock('@/components/motion/useReducedMotion');
  jest.dontMock('@/theme/ThemeProvider');
  jest.dontMock('@/utils/motionKnobs');
  jest.resetModules();

  return {
    intervalDelayMs,
    revealedText,
    storeConstructed,
    storeSubscriptions,
    toastEntryMs,
  };
}

describe('legacy motion consumer isolation', () => {
  const globalWithDev = globalThis as { __DEV__?: boolean };
  const originalDev = globalWithDev.__DEV__;

  afterAll(() => {
    globalWithDev.__DEV__ = originalDev;
  });

  it('imports release consumers without constructing or subscribing to the knob store', () => {
    const result = probeConsumers(false, {
      wordDrainCadenceMs: 1,
      wordDrainMaxLagMs: 1,
      toastEntryMs: 1,
    });
    const expectedQuota =
      100 -
      Math.floor(
        LEGACY_MOTION_TUNING_DEFAULTS.wordDrainMaxLagMs /
          LEGACY_MOTION_TUNING_DEFAULTS.wordDrainCadenceMs
      ) +
      1;
    expect(result.storeConstructed).toBe(false);
    expect(result.storeSubscriptions).toBe(0);
    expect(Object.isFrozen(LEGACY_MOTION_TUNING_DEFAULTS)).toBe(true);
    expect(result.intervalDelayMs).toBe(
      LEGACY_MOTION_TUNING_DEFAULTS.wordDrainCadenceMs
    );
    expect(result.revealedText).toBe(
      splitAtUnitBoundary(sourceText, expectedQuota).head
    );
    expect(result.toastEntryMs).toBe(
      LEGACY_MOTION_TUNING_DEFAULTS.toastEntryMs
    );
  });

  it('keeps Motion Lab tuning connected to both dev consumers', () => {
    const tuning = {
      wordDrainCadenceMs: 96,
      wordDrainMaxLagMs: 960,
      toastEntryMs: 640,
    };
    const result = probeConsumers(true, tuning);
    const expectedQuota = 100 - Math.floor(960 / 96) + 1;
    expect(result.storeConstructed).toBe(true);
    expect(result.storeSubscriptions).toBe(2);
    expect(result.intervalDelayMs).toBe(tuning.wordDrainCadenceMs);
    expect(result.revealedText).toBe(
      splitAtUnitBoundary(sourceText, expectedQuota).head
    );
    expect(result.toastEntryMs).toBe(tuning.toastEntryMs);
  });
});
