import { act, fireEvent } from '@testing-library/react-native';
import React from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import { State } from 'react-native-gesture-handler';

import { RadialDial } from '@/components/dial/RadialDial';
import {
  getDialLayouts,
  getDialPetalAngle,
  getDialPetalPosition,
  hitTestDialPetals,
} from '@/components/dial/hitTesting';
import { DEFAULT_DIAL_PETALS } from '@/components/dial/petalRegistry';
import { runRegentEventHaptic } from '@/components/ui/haptics';
import {
  DIAL_BASE_PETAL_SIZE,
  DIAL_RING_GAP,
  DIAL_TUNING_DEFAULTS,
  type DialTuning,
} from '@/utils/dialConstants';
import {
  MOTION_KNOB_DEFAULTS,
  resetMotionKnobs,
} from '@/utils/motionKnobs';
import { renderThemed } from './helpers/renderThemed';

let mockReducedMotionEnabled = false;

jest.mock('@/components/motion/useReducedMotion', () => ({
  useReducedMotion: () => mockReducedMotionEnabled,
}));

jest.mock('@/components/motion/MotionLab', () => {
  throw new Error('RadialDial production path must not import MotionLab');
});

jest.mock('@expo/vector-icons/Ionicons', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return function MockIonicon({ name }: { name: string }) {
    return ReactModule.createElement(Text, null, name);
  };
});

jest.mock('@/components/ui/haptics', () => ({
  runRegentEventHaptic: jest.fn(),
}));

jest.mock('react-native-gesture-handler', () => {
  const actual = jest.requireActual<typeof import('react-native-gesture-handler')>(
    'react-native-gesture-handler'
  );
  let callbacks: Record<string, (...args: unknown[]) => void> = {};

  return {
    ...actual,
    Gesture: {
      ...actual.Gesture,
      Pan: () => {
        callbacks = {};
        const pan = {
          minDistance: () => pan,
          onBegin: (callback: (...args: unknown[]) => void) => {
            callbacks.onBegin = callback;
            return pan;
          },
          onUpdate: (callback: (...args: unknown[]) => void) => {
            callbacks.onUpdate = callback;
            return pan;
          },
          onEnd: (callback: (...args: unknown[]) => void) => {
            callbacks.onEnd = callback;
            return pan;
          },
          onFinalize: (callback: (...args: unknown[]) => void) => {
            callbacks.onFinalize = callback;
            return pan;
          },
        };
        return pan;
      },
    },
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
    getCapturedPanCallbacks: () => callbacks,
  };
});

type CapturedPanCallbacks = {
  onBegin: (event: object) => void;
  onUpdate: (event: { x: number; y: number }) => void;
  onEnd: (event: { x: number; y: number }, success: boolean) => void;
  onFinalize: (event: { state: number }, success: boolean) => void;
};

function getCapturedPanCallbacks(): CapturedPanCallbacks {
  const gestureHandlerMock = jest.requireMock('react-native-gesture-handler') as {
    getCapturedPanCallbacks: () => CapturedPanCallbacks;
  };
  return gestureHandlerMock.getCapturedPanCallbacks();
}

function gesturePoint(point: { x: number; y: number }) {
  return { x: point.x + 32, y: point.y + 32 };
}

describe('RadialDial', () => {
  const globalWithDev = globalThis as { __DEV__?: boolean };
  const originalDev = globalWithDev.__DEV__;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReducedMotionEnabled = false;
    Dimensions.set({
      window: { fontScale: 1, height: 844, scale: 3, width: 390 },
      screen: { fontScale: 1, height: 844, scale: 3, width: 390 },
    });
    globalWithDev.__DEV__ = true;
    resetMotionKnobs();
  });

  afterAll(() => {
    globalWithDev.__DEV__ = originalDev;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('expands from the center tap and collapses from the scrim tap', () => {
    const onExpand = jest.fn();
    const { getByLabelText, getByTestId } = renderThemed(
      <RadialDial
        bottomOffset={112}
        onAction={jest.fn()}
        onExpand={onExpand}
        petals={DEFAULT_DIAL_PETALS}
        rightOffset={16}
      />
    );

    fireEvent.press(getByLabelText('Open radial dial'));
    expect(getByLabelText('Close radial dial')).toBeTruthy();

    fireEvent.press(getByTestId('dial-scrim'));
    expect(getByLabelText('Open radial dial')).toBeTruthy();

    fireEvent.press(getByLabelText('Open radial dial'));
    expect(onExpand).toHaveBeenCalledTimes(2);
  });

  it('opens the Pay submenu and commits its Send action', () => {
    const onAction = jest.fn();
    const { getByLabelText } = renderThemed(
      <RadialDial
        bottomOffset={112}
        onAction={onAction}
        petals={DEFAULT_DIAL_PETALS}
        rightOffset={16}
      />
    );

    fireEvent.press(getByLabelText('Open radial dial'));
    fireEvent.press(getByLabelText('Pay'));
    fireEvent.press(getByLabelText('Send'));

    expect(onAction).toHaveBeenCalledWith({
      kind: 'navigate',
      href: '/(tabs)/send',
    });
    expect(getByLabelText('Open radial dial')).toBeTruthy();
  });

  it('exposes button roles and expanded state for the center and submenu owner', () => {
    const { getByLabelText } = renderThemed(
      <RadialDial
        bottomOffset={112}
        onAction={jest.fn()}
        petals={DEFAULT_DIAL_PETALS}
        rightOffset={16}
      />
    );

    const closedCenter = getByLabelText('Open radial dial');
    expect(closedCenter.props.accessibilityRole).toBe('button');
    expect(closedCenter.props.accessibilityState).toEqual({ expanded: false });

    fireEvent.press(closedCenter);
    const pay = getByLabelText('Pay');
    expect(pay.props.accessibilityRole).toBe('button');
    expect(pay.props.accessibilityState).toEqual({
      expanded: false,
      selected: false,
    });

    fireEvent.press(pay);
    expect(getByLabelText('Pay').props.accessibilityState).toEqual({
      expanded: true,
      selected: false,
    });
    expect(getByLabelText('Send').props.accessibilityState).toEqual({
      expanded: undefined,
      selected: false,
    });
  });

  it('keeps maximum-size petals inside disjoint hit bands without overlap', () => {
    Dimensions.set({
      window: { fontScale: 3.1, height: 1000, scale: 3, width: 800 },
      screen: { fontScale: 3.1, height: 1000, scale: 3, width: 800 },
    });
    const { getByLabelText, getByText } = renderThemed(
      <RadialDial
        bottomOffset={112}
        onAction={jest.fn()}
        petals={DEFAULT_DIAL_PETALS}
        rightOffset={16}
      />
    );

    fireEvent.press(getByLabelText('Open radial dial'));

    const message = getByLabelText('Message');
    expect(message).toHaveStyle({ width: 152, height: 152 });
    expect(getByText('Message').props.numberOfLines).toBe(2);

    fireEvent.press(getByLabelText('Pay'));
    expect(getByLabelText('Send')).toHaveStyle({ width: 152, height: 152 });

    const renderedPetalSize = StyleSheet.flatten(message.props.style).width as number;
    const layouts = getDialLayouts(
      DIAL_TUNING_DEFAULTS.firstRingRadius,
      DIAL_TUNING_DEFAULTS.secondRingRadius,
      renderedPetalSize,
      DEFAULT_DIAL_PETALS.length,
      1
    );
    const assertRingGeometry = (
      layout: typeof layouts.first,
      petalCount: number
    ) => {
      expect(layout.radius - renderedPetalSize / 2).toBeGreaterThanOrEqual(
        layout.minRadius
      );
      expect(layout.radius + renderedPetalSize / 2).toBeLessThanOrEqual(
        layout.maxRadius
      );

      const positions = Array.from({ length: petalCount }, (_, index) =>
        getDialPetalPosition(index, petalCount, layout.radius, layout.angleStep)
      );
      for (let index = 1; index < positions.length; index += 1) {
        expect(
          Math.hypot(
            positions[index].x - positions[index - 1].x,
            positions[index].y - positions[index - 1].y
          )
        ).toBeGreaterThanOrEqual(renderedPetalSize - 1e-9);
      }
      positions.forEach((position, index) => {
        expect(
          hitTestDialPetals(
            position.x,
            position.y,
            petalCount,
            layout,
            DIAL_TUNING_DEFAULTS.deadZoneRadius
          ).petalIndex
        ).toBe(index);
      });
    };

    assertRingGeometry(layouts.first, DEFAULT_DIAL_PETALS.length);
    assertRingGeometry(layouts.second, 1);
    expect(layouts.second.minRadius).toBeGreaterThanOrEqual(
      layouts.first.maxRadius + DIAL_RING_GAP
    );
  });

  it('keeps max-font petals and hit bands inside the canvas and keyboard-safe viewport', () => {
    const viewport = { height: 844, width: 390 };
    const keyboardHeight = 300;
    const bottomOffset = keyboardHeight + 92;
    const rightOffset = 16;
    Dimensions.set({
      window: { fontScale: 3.1, ...viewport, scale: 3 },
      screen: { fontScale: 3.1, ...viewport, scale: 3 },
    });
    const { getByLabelText, getByTestId, getByText } = renderThemed(
      <RadialDial
        bottomOffset={bottomOffset}
        onAction={jest.fn()}
        petals={DEFAULT_DIAL_PETALS}
        rightOffset={rightOffset}
      />
    );

    fireEvent.press(getByLabelText('Open radial dial'));
    fireEvent.press(getByLabelText('Pay'));

    const canvasStyle = StyleSheet.flatten(getByTestId('radial-dial').props.style);
    const canvasSize = canvasStyle.width as number;
    const canvasLeft = viewport.width - rightOffset - canvasSize;
    const canvasTop = viewport.height - bottomOffset - canvasSize;
    const keyboardTop = viewport.height - keyboardHeight;
    expect(canvasStyle.height).toBe(canvasSize);
    expect(canvasLeft).toBeGreaterThanOrEqual(0);
    expect(canvasTop).toBeGreaterThanOrEqual(0);
    expect(canvasLeft + canvasSize).toBeLessThanOrEqual(viewport.width);
    expect(canvasTop + canvasSize).toBe(viewport.height - bottomOffset);
    expect(canvasTop + canvasSize).toBeLessThanOrEqual(keyboardTop);

    const message = getByLabelText('Message');
    const petalSize = StyleSheet.flatten(message.props.style).width as number;
    expect(petalSize).toBeLessThan(152);
    expect(getByText('Message').props.allowFontScaling).not.toBe(false);

    const centerStyle = StyleSheet.flatten(
      getByTestId('dial-center-position').props.style
    );
    const centerCoordinate = (centerStyle.left as number) + 32;
    const layouts = getDialLayouts(
      DIAL_TUNING_DEFAULTS.firstRingRadius,
      DIAL_TUNING_DEFAULTS.secondRingRadius,
      petalSize,
      DEFAULT_DIAL_PETALS.length,
      1
    );
    const petalPositions = [
      ...DEFAULT_DIAL_PETALS.map((petal) =>
        getByTestId(`dial-petal-position-first-${petal.id}`)
      ),
      getByTestId('dial-petal-position-second-send'),
    ];
    for (const position of petalPositions) {
      const style = StyleSheet.flatten(position.props.style);
      const left = style.left as number;
      const top = style.top as number;
      const floatExtent = DIAL_TUNING_DEFAULTS.floatAmplitude;

      expect(left).toBeGreaterThanOrEqual(0);
      expect(top - floatExtent).toBeGreaterThanOrEqual(0);
      expect(left + petalSize).toBeLessThanOrEqual(canvasSize);
      expect(top + petalSize + floatExtent).toBeLessThanOrEqual(canvasSize);
      expect(canvasLeft + left).toBeGreaterThanOrEqual(0);
      expect(canvasTop + top - floatExtent).toBeGreaterThanOrEqual(0);
      expect(canvasLeft + left + petalSize).toBeLessThanOrEqual(viewport.width);
      expect(canvasTop + top + petalSize + floatExtent).toBeLessThanOrEqual(
        keyboardTop
      );
    }

    for (const layout of [layouts.first, layouts.second]) {
      const hitBandStart = centerCoordinate - layout.maxRadius;
      const hitBandEnd = centerCoordinate;
      expect(hitBandStart).toBeGreaterThanOrEqual(0);
      expect(hitBandEnd).toBeLessThanOrEqual(canvasSize);
      expect(canvasLeft + hitBandStart).toBeGreaterThanOrEqual(0);
      expect(canvasTop + hitBandStart).toBeGreaterThanOrEqual(0);
      expect(canvasLeft + hitBandEnd).toBeLessThanOrEqual(viewport.width);
      expect(canvasTop + hitBandEnd).toBeLessThanOrEqual(keyboardTop);
    }
  });

  it('uses opacity-only crossfades and no floating transform under reduced motion', () => {
    mockReducedMotionEnabled = true;
    const { getByLabelText, getByTestId } = renderThemed(
      <RadialDial
        bottomOffset={112}
        onAction={jest.fn()}
        petals={DEFAULT_DIAL_PETALS}
        rightOffset={16}
      />
    );

    fireEvent.press(getByLabelText('Open radial dial'));
    const positionStyle = StyleSheet.flatten(
      getByTestId('dial-petal-position-first-voice').props.style
    );
    expect(positionStyle.transform).toBeUndefined();
  });

  it('rate-limits selection ticks during fast circular drags', async () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000);
    renderThemed(
      <RadialDial
        bottomOffset={112}
        onAction={jest.fn()}
        petals={DEFAULT_DIAL_PETALS}
        rightOffset={16}
      />
    );
    const pan = getCapturedPanCallbacks();
    const layout = getDialLayouts(
      MOTION_KNOB_DEFAULTS.dialFirstRingRadius,
      MOTION_KNOB_DEFAULTS.dialSecondRingRadius,
      DIAL_BASE_PETAL_SIZE,
      DEFAULT_DIAL_PETALS.length,
      1
    ).first;
    const pointFor = (index: number) => {
      const point = getDialPetalPosition(
        index,
        DEFAULT_DIAL_PETALS.length,
        layout.radius,
        layout.angleStep
      );
      return gesturePoint(point);
    };

    await act(async () => {
      pan.onBegin({});
      pan.onUpdate(pointFor(0));
      pan.onUpdate(pointFor(1));
      pan.onUpdate(pointFor(2));
      await Promise.resolve();
    });
    expect(runRegentEventHaptic).toHaveBeenCalledTimes(1);
    expect(runRegentEventHaptic).toHaveBeenCalledWith('dialSelectionChanged');

    nowSpy.mockReturnValue(1_090);
    await act(async () => {
      pan.onUpdate(pointFor(3));
      await Promise.resolve();
    });
    expect(runRegentEventHaptic).toHaveBeenCalledTimes(2);
    nowSpy.mockRestore();
  });

  it('commits the hysteresis-lagged visible petal instead of the fresh raw hit', async () => {
    const onAction = jest.fn();
    const { getByLabelText } = renderThemed(
      <RadialDial
        bottomOffset={112}
        onAction={onAction}
        petals={DEFAULT_DIAL_PETALS}
        rightOffset={16}
      />
    );
    const pan = getCapturedPanCallbacks();
    const layout = getDialLayouts(
      MOTION_KNOB_DEFAULTS.dialFirstRingRadius,
      MOTION_KNOB_DEFAULTS.dialSecondRingRadius,
      DIAL_BASE_PETAL_SIZE,
      DEFAULT_DIAL_PETALS.length,
      1
    ).first;
    const firstPoint = gesturePoint(
      getDialPetalPosition(
        0,
        DEFAULT_DIAL_PETALS.length,
        layout.radius,
        layout.angleStep
      )
    );
    const boundaryAngle =
      (getDialPetalAngle(0, DEFAULT_DIAL_PETALS.length, layout.angleStep) +
        getDialPetalAngle(1, DEFAULT_DIAL_PETALS.length, layout.angleStep)) /
      2;
    const rawSecondPoint = {
      x: Math.cos(boundaryAngle + 0.005) * layout.radius,
      y: Math.sin(boundaryAngle + 0.005) * layout.radius,
    };
    expect(
      hitTestDialPetals(
        rawSecondPoint.x,
        rawSecondPoint.y,
        DEFAULT_DIAL_PETALS.length,
        layout
      ).petalIndex
    ).toBe(1);
    const releasePoint = gesturePoint(rawSecondPoint);

    await act(async () => {
      pan.onBegin({});
      pan.onUpdate(firstPoint);
      pan.onUpdate(releasePoint);
      await Promise.resolve();
    });
    expect(getByLabelText('Voice').props.accessibilityState.selected).toBe(true);
    expect(getByLabelText('Profile').props.accessibilityState.selected).toBe(false);

    await act(async () => {
      pan.onEnd(releasePoint, true);
      await Promise.resolve();
    });

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith({ kind: 'primaryAgentVoice' });
    expect(onAction).not.toHaveBeenCalledWith({
      kind: 'navigate',
      href: '/settings',
    });
  });

  it('cancels a release in the dead zone even while a petal is highlighted', async () => {
    const onAction = jest.fn();
    renderThemed(
      <RadialDial
        bottomOffset={112}
        onAction={onAction}
        petals={DEFAULT_DIAL_PETALS}
        rightOffset={16}
      />
    );
    const pan = getCapturedPanCallbacks();
    const layout = getDialLayouts(
      MOTION_KNOB_DEFAULTS.dialFirstRingRadius,
      MOTION_KNOB_DEFAULTS.dialSecondRingRadius,
      DIAL_BASE_PETAL_SIZE,
      DEFAULT_DIAL_PETALS.length,
      1
    ).first;

    await act(async () => {
      pan.onBegin({});
      pan.onUpdate(
        gesturePoint(
          getDialPetalPosition(
            0,
            DEFAULT_DIAL_PETALS.length,
            layout.radius,
            layout.angleStep
          )
        )
      );
      pan.onEnd({ x: 32, y: 32 }, true);
      await Promise.resolve();
    });

    expect(onAction).not.toHaveBeenCalled();
    expect(runRegentEventHaptic).toHaveBeenCalledWith('dialCancelled');
  });

  it('cancels an interrupted pan without committing an action', async () => {
    const onAction = jest.fn();
    const { getByLabelText } = renderThemed(
      <RadialDial
        bottomOffset={112}
        onAction={onAction}
        petals={DEFAULT_DIAL_PETALS}
        rightOffset={16}
      />
    );
    const pan = getCapturedPanCallbacks();
    const profilePoint = { x: -76, y: 32 };

    await act(async () => {
      pan.onBegin({});
      pan.onUpdate(profilePoint);
      await Promise.resolve();
    });
    expect(getByLabelText('Close radial dial')).toBeTruthy();

    await act(async () => {
      pan.onEnd(profilePoint, false);
      pan.onFinalize({ state: State.CANCELLED }, false);
      await Promise.resolve();
    });

    expect(onAction).not.toHaveBeenCalled();
    expect(getByLabelText('Open radial dial')).toBeTruthy();
    expect(runRegentEventHaptic).toHaveBeenCalledWith('dialCancelled');
  });

  it('imports the release dial without constructing or subscribing to the knob store', () => {
    let storeConstructed = false;
    let subscribed = false;
    globalWithDev.__DEV__ = false;

    jest.isolateModules(() => {
      jest.doMock('@/utils/motionKnobs', () => {
        storeConstructed = true;
        return {
          getMotionKnobs: () => {
            throw new Error('release dial read mutable knobs');
          },
          subscribeMotionKnobs: () => {
            subscribed = true;
            return () => undefined;
          },
        };
      });

      const { RadialDial: ReleaseRadialDial } =
        require('@/components/dial/RadialDial') as typeof import('@/components/dial/RadialDial');
      const element = ReleaseRadialDial({
        bottomOffset: 112,
        onAction: jest.fn(),
        petals: DEFAULT_DIAL_PETALS,
        rightOffset: 16,
      }) as React.ReactElement<{ tuning: Readonly<DialTuning> }>;

      expect(element.props.tuning).toStrictEqual(DIAL_TUNING_DEFAULTS);
      expect(Object.isFrozen(element.props.tuning)).toBe(true);
    });

    expect(storeConstructed).toBe(false);
    expect(subscribed).toBe(false);
    jest.dontMock('@/utils/motionKnobs');
    jest.resetModules();
  });
});
