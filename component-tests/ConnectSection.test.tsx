import { act, waitFor } from '@testing-library/react-native';
import React from 'react';

import { ConnectSection } from '@/components/settings/ConnectSection';
import { renderThemed } from './helpers/renderThemed';

const mockGetPortalPairing = jest.fn();
const mockRouter = {
  push: jest.fn(),
};
let mockFocusCallback: (() => void | (() => void)) | null = null;

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void | (() => void)) => {
    mockFocusCallback = callback;
  },
  useRouter: () => mockRouter,
}));

jest.mock('@/hooks/useRegentsAuth', () => ({
  useRegentsAuth: () => ({
    regentsUserId: 'user-a',
  }),
}));

jest.mock('@/utils/regentApi/client', () => ({
  regentApi: {
    getPortalPairing: (...args: unknown[]) => mockGetPortalPairing(...args),
  },
}));

describe('ConnectSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFocusCallback = null;
    mockGetPortalPairing.mockResolvedValue({
      paired: false,
      accountLabel: null,
      pairedAt: null,
    });
  });

  it('reloads Portal pairing status whenever the screen gains focus', async () => {
    renderThemed(<ConnectSection />);
    expect(mockFocusCallback).not.toBeNull();

    let cleanup: void | (() => void) = undefined;
    await act(async () => {
      cleanup = mockFocusCallback?.();
    });
    await waitFor(() => expect(mockGetPortalPairing).toHaveBeenCalledTimes(1));

    await act(async () => {
      cleanup?.();
      cleanup = mockFocusCallback?.();
    });
    await waitFor(() => expect(mockGetPortalPairing).toHaveBeenCalledTimes(2));

    cleanup?.();
  });
});
