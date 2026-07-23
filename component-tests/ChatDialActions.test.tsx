import { act, fireEvent, render } from '@testing-library/react-native';
import React from 'react';

import { DialOverlayHost } from '@/components/dial/DialOverlayHost';
import { runRegentHaptic } from '@/components/ui/haptics';
import {
  appendToMessageComposer,
  captureMessageComposerController,
  runMessageComposerAction,
} from '@/utils/messageComposerBridge';
import * as Clipboard from 'expo-clipboard';

const mockPush = jest.fn();
const mockListRegents = jest.fn();
const mockListMessageThreads = jest.fn();
let mockActiveComposer: object | null = null;

jest.mock('expo-router', () => ({
  usePathname: () => '/message/thread-123',
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('expo-clipboard', () => ({
  getStringAsync: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('@/hooks/useKeyboardHeight', () => ({
  useKeyboardHeight: () => 0,
}));

jest.mock('@/utils/regentApi/client', () => ({
  regentApi: {
    listRegents: () => mockListRegents(),
    listMessageThreads: () => mockListMessageThreads(),
  },
}));

jest.mock('@/utils/messageComposerBridge', () => ({
  appendToMessageComposer: jest.fn(),
  captureMessageComposerController: jest.fn(),
  runMessageComposerAction: jest.fn(),
}));

jest.mock('@/components/ui/haptics', () => ({
  runRegentHaptic: jest.fn(),
}));

jest.mock('@/components/dial/RadialDial', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { Pressable, Text, View } =
    jest.requireActual<typeof import('react-native')>('react-native');

  type MockPetal = {
    label: string;
    action: unknown;
    submenu?: readonly MockPetal[];
  };

  const renderPetal = (
    petal: MockPetal,
    onAction: (action: unknown) => void
  ): React.ReactNode =>
    ReactModule.createElement(
      ReactModule.Fragment,
      { key: petal.label },
      ReactModule.createElement(
        Pressable,
        { accessibilityLabel: petal.label, onPress: () => onAction(petal.action) },
        ReactModule.createElement(Text, null, petal.label)
      ),
      petal.submenu?.map((item) => renderPetal(item, onAction))
    );

  return {
    RadialDial: ({
      onAction,
      petals,
    }: {
      onAction: (action: unknown) => void;
      petals: readonly MockPetal[];
    }) =>
      ReactModule.createElement(
        View,
        null,
        petals.map((petal) => renderPetal(petal, onAction))
      ),
  };
});

describe('message thread dial actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListRegents.mockResolvedValue([]);
    mockListMessageThreads.mockResolvedValue([]);
    mockActiveComposer = {};
    jest.mocked(captureMessageComposerController).mockImplementation(
      () => mockActiveComposer as never
    );
    jest.mocked(appendToMessageComposer).mockImplementation(
      (controller) => controller === mockActiveComposer
    );
    jest.mocked(runMessageComposerAction).mockReturnValue(true);
  });

  it('registers the message composer petals and Scan QR submenu item', () => {
    const screen = render(<DialOverlayHost />);

    for (const label of ['Voice', 'Paste', 'Commands', 'Keyboard', 'Attach', 'Scan QR']) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
  });

  it('appends clipboard text through the composer bridge', async () => {
    jest.mocked(Clipboard.getStringAsync).mockResolvedValue('from clipboard');
    const screen = render(<DialOverlayHost />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Paste'));
      await Promise.resolve();
    });

    expect(appendToMessageComposer).toHaveBeenCalledWith(
      mockActiveComposer,
      'from clipboard'
    );
  });

  it('gives subtle feedback when the clipboard is empty', async () => {
    jest.mocked(Clipboard.getStringAsync).mockResolvedValue('');
    const screen = render(<DialOverlayHost />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Paste'));
      await Promise.resolve();
    });

    expect(appendToMessageComposer).not.toHaveBeenCalled();
    expect(runRegentHaptic).toHaveBeenCalledWith('selection');
  });

  it('drops paste if another thread becomes active during the clipboard read', async () => {
    let resolveClipboard: (text: string) => void = () => undefined;
    jest.mocked(Clipboard.getStringAsync).mockReturnValue(
      new Promise((resolve) => {
        resolveClipboard = resolve;
      })
    );
    const threadAtCommit = mockActiveComposer;
    const screen = render(<DialOverlayHost />);

    fireEvent.press(screen.getByLabelText('Paste'));
    mockActiveComposer = {};

    await act(async () => {
      resolveClipboard('wrong thread');
      await Promise.resolve();
    });

    expect(appendToMessageComposer).toHaveBeenCalledWith(
      threadAtCommit,
      'wrong thread'
    );
    expect(runRegentHaptic).toHaveBeenCalledWith('selection');
  });

  it('focuses the composer through the typed bridge', () => {
    const screen = render(<DialOverlayHost />);

    fireEvent.press(screen.getByLabelText('Keyboard'));

    expect(runMessageComposerAction).toHaveBeenCalledWith('keyboard');
  });

  it('gives cancel feedback when Commands cannot safely open', () => {
    jest.mocked(runMessageComposerAction).mockReturnValue(false);
    const screen = render(<DialOverlayHost />);

    fireEvent.press(screen.getByLabelText('Commands'));

    expect(runRegentHaptic).toHaveBeenCalledWith('selection');
  });
});
