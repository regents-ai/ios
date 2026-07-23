import { act, fireEvent } from '@testing-library/react-native';
import React from 'react';
import { State } from 'react-native-gesture-handler';

import { RadialDial } from '@/components/dial/RadialDial';
import { DEFAULT_DIAL_PETALS } from '@/components/dial/petalRegistry';
import { runRegentEventHaptic } from '@/components/ui/haptics';
import { renderThemed } from './helpers/renderThemed';

jest.mock('@/components/motion/useReducedMotion', () => ({
  useReducedMotion: () => false,
}));

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

describe('RadialDial', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
});
