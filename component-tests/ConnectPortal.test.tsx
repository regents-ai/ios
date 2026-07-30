import { act, waitFor } from '@testing-library/react-native';
import React from 'react';

import ConnectPortalScreen from '@/app/onboarding/connect-portal';
import { renderThemed } from './helpers/renderThemed';

const mockRouter = {
  back: jest.fn(),
  push: jest.fn(),
  replace: jest.fn(),
};
const mockGetPortalPairing = jest.fn();
const mockStartPortalPairing = jest.fn();
const mockCompletePortalPairing = jest.fn();
const mockDisconnectPortalPairing = jest.fn();
let mockRegentsUserId: string | null = null;
let mockChatGptSession: { id: string } | null = null;
let mockSearchParams: { returnUrl?: string } = {};
let mockFocusCallback: (() => void | (() => void)) | null = null;
let mockFocusCleanup: (() => void) | null = null;

jest.mock('expo-router', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  return {
    useFocusEffect: (callback: () => void | (() => void)) => {
      ReactModule.useEffect(() => {
        mockFocusCallback = callback;
        const cleanup = callback();
        mockFocusCleanup = typeof cleanup === 'function' ? cleanup : null;
        return () => {
          cleanup?.();
          if (mockFocusCleanup === cleanup) {
            mockFocusCleanup = null;
          }
        };
      }, [callback]);
    },
    useLocalSearchParams: () => mockSearchParams,
    useRouter: () => mockRouter,
  };
});

jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(),
}));

jest.mock('@/hooks/useRegentsAuth', () => ({
  useRegentsAuth: () => ({
    regentsUserId: mockRegentsUserId,
  }),
}));

jest.mock('@/hooks/useChatGptAuth', () => ({
  useChatGptAuth: () => ({
    session: mockChatGptSession,
  }),
}));

jest.mock('@/components/ui/haptics', () => ({
  runRegentEventHaptic: jest.fn(),
  runRegentHaptic: jest.fn(),
}));

jest.mock('@/utils/regentApi/client', () => ({
  regentApi: {
    getPortalPairing: (...args: unknown[]) => mockGetPortalPairing(...args),
    startPortalPairing: (...args: unknown[]) => mockStartPortalPairing(...args),
    completePortalPairing: (...args: unknown[]) => mockCompletePortalPairing(...args),
    disconnectPortalPairing: (...args: unknown[]) => mockDisconnectPortalPairing(...args),
  },
}));

describe('ConnectPortalScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRegentsUserId = null;
    mockChatGptSession = null;
    mockSearchParams = {};
    mockFocusCallback = null;
    mockFocusCleanup = null;
  });

  it('shows the sign-in-first state', async () => {
    const { findByText } = renderThemed(<ConnectPortalScreen />);

    expect(await findByText('Sign in first')).toBeTruthy();
    expect(mockGetPortalPairing).not.toHaveBeenCalled();
  });

  it('shows the idle pairing state for an unpaired signed-in user', async () => {
    mockRegentsUserId = 'user-a';
    mockChatGptSession = { id: 'chat-session' };
    mockGetPortalPairing.mockResolvedValue({
      paired: false,
      accountLabel: null,
      pairedAt: null,
    });

    const { findByText } = renderThemed(<ConnectPortalScreen />);

    expect(await findByText('Connect Nous Portal')).toBeTruthy();
    expect(await findByText('Pair Nous Portal')).toBeTruthy();
  });

  it('shows the paired state and account label', async () => {
    mockRegentsUserId = 'user-a';
    mockChatGptSession = { id: 'chat-session' };
    mockGetPortalPairing.mockResolvedValue({
      paired: true,
      accountLabel: 'Research account',
      pairedAt: '2026-07-30T12:00:00.000Z',
    });

    const { findByText } = renderThemed(<ConnectPortalScreen />);

    expect(await findByText('Connected')).toBeTruthy();
    expect(
      await findByText('Research account is paired with this Regents account.'),
    ).toBeTruthy();
    expect(await findByText('Disconnect')).toBeTruthy();
  });

  it('quietly drops a stale post-request result and reloads truth on focus', async () => {
    mockRegentsUserId = 'user-a';
    mockChatGptSession = { id: 'chat-session' };
    mockSearchParams = {
      returnUrl:
        'regentsmobile://portal-return?code=returned-code&state=returned-state',
    };
    mockGetPortalPairing
      .mockResolvedValueOnce({
        paired: false,
        accountLabel: null,
        pairedAt: null,
      })
      .mockResolvedValueOnce({
        paired: true,
        accountLabel: 'Research account',
        pairedAt: '2026-07-30T12:00:00.000Z',
      });
    let resolveComplete!: (status: {
      paired: boolean;
      accountLabel: string | null;
      pairedAt: string | null;
    }) => void;
    mockCompletePortalPairing.mockImplementation(() => new Promise((resolve) => {
      resolveComplete = resolve;
    }));

    const screen = renderThemed(<ConnectPortalScreen />);
    await waitFor(() => expect(mockCompletePortalPairing).toHaveBeenCalledTimes(1));

    act(() => {
      mockFocusCleanup?.();
      mockFocusCleanup = null;
    });
    await act(async () => {
      resolveComplete({
        paired: true,
        accountLabel: 'Research account',
        pairedAt: '2026-07-30T12:00:00.000Z',
      });
    });

    expect(screen.queryByText('Pairing stopped')).toBeNull();

    await act(async () => {
      const cleanup = mockFocusCallback?.();
      mockFocusCleanup = typeof cleanup === 'function' ? cleanup : null;
    });
    expect(await screen.findByText('Connected')).toBeTruthy();
    expect(await screen.findByText(
      'Research account is paired with this Regents account.',
    )).toBeTruthy();
    expect(screen.queryByText('Pairing stopped')).toBeNull();
  });
});
