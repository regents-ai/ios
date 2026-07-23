import { act, fireEvent, render } from '@testing-library/react-native';
import React from 'react';

import { DialOverlayHost } from '@/components/dial/DialOverlayHost';

const mockPush = jest.fn();
const mockListRegents = jest.fn();
const mockListMessageThreads = jest.fn();

jest.mock('expo-router', () => ({
  usePathname: () => '/home',
  useRouter: () => ({ push: mockPush }),
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

jest.mock('@/components/dial/RadialDial', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { Pressable, Text } =
    jest.requireActual<typeof import('react-native')>('react-native');

  return {
    RadialDial: ({ onExpand }: { onExpand?: () => void }) =>
      ReactModule.createElement(
        Pressable,
        { accessibilityLabel: 'Bloom dial', onPress: onExpand },
        ReactModule.createElement(Text, null, 'Bloom')
      ),
  };
});

describe('DialOverlayHost', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListRegents.mockResolvedValue([]);
    mockListMessageThreads.mockResolvedValue([]);
  });

  it('refreshes agent and thread targets again when the dial expands', async () => {
    const screen = render(<DialOverlayHost />);

    await act(async () => {
      await Promise.resolve();
    });
    expect(mockListRegents).toHaveBeenCalledTimes(1);
    expect(mockListMessageThreads).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByLabelText('Bloom dial'));

    expect(mockListRegents).toHaveBeenCalledTimes(2);
    expect(mockListMessageThreads).toHaveBeenCalledTimes(2);
  });
});
