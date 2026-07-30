import { act, fireEvent, waitFor } from '@testing-library/react-native';
import React from 'react';

import ConnectPortalScreen from '@/app/onboarding/connect-portal';
import { ThemeProvider } from '@/theme/ThemeProvider';
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
const mockOpenAuthSessionAsync = jest.fn();
const mockRunRegentEventHaptic = jest.fn();
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
  openAuthSessionAsync: (...args: unknown[]) => mockOpenAuthSessionAsync(...args),
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
  runRegentEventHaptic: (...args: unknown[]) => mockRunRegentEventHaptic(...args),
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

  it('keeps a newer return owned when an older completion resolves after refocus', async () => {
    mockRegentsUserId = 'user-a';
    mockChatGptSession = { id: 'chat-session' };
    mockSearchParams = {
      returnUrl:
        'regentsmobile://portal-return?code=older-code&state=older-state',
    };
    mockGetPortalPairing.mockResolvedValue({
      paired: false,
      accountLabel: null,
      pairedAt: null,
    });
    let resolveOlder!: (status: {
      paired: boolean;
      accountLabel: string | null;
      pairedAt: string | null;
    }) => void;
    let resolveNewer!: (status: {
      paired: boolean;
      accountLabel: string | null;
      pairedAt: string | null;
    }) => void;
    mockCompletePortalPairing
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveOlder = resolve;
      }))
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveNewer = resolve;
      }));

    const screen = renderThemed(<ConnectPortalScreen />);
    await waitFor(() => expect(mockCompletePortalPairing).toHaveBeenCalledTimes(1));

    act(() => {
      mockFocusCleanup?.();
      mockFocusCleanup = null;
    });
    await act(async () => {
      const cleanup = mockFocusCallback?.();
      mockFocusCleanup = typeof cleanup === 'function' ? cleanup : null;
    });
    expect(mockGetPortalPairing).toHaveBeenCalledTimes(1);

    mockSearchParams = {
      returnUrl:
        'regentsmobile://portal-return?code=newer-code&state=newer-state',
    };
    screen.rerender(
      <ThemeProvider>
        <ConnectPortalScreen />
      </ThemeProvider>,
    );
    await waitFor(() => expect(mockCompletePortalPairing).toHaveBeenCalledTimes(2));

    await act(async () => {
      resolveOlder({
        paired: true,
        accountLabel: 'Older account',
        pairedAt: '2026-07-30T12:00:00.000Z',
      });
    });
    expect(screen.getByText('Pairing…')).toBeTruthy();
    expect(screen.queryByText('Pairing stopped')).toBeNull();
    expect(mockGetPortalPairing).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveNewer({
        paired: true,
        accountLabel: 'Newer account',
        pairedAt: '2026-07-30T12:01:00.000Z',
      });
    });
    expect(await screen.findByText(
      'Newer account is paired with this Regents account.',
    )).toBeTruthy();
    expect(screen.queryByText('Pairing stopped')).toBeNull();
  });

  it('loads the new user and silently drops the old user completion', async () => {
    mockRegentsUserId = 'user-a';
    mockChatGptSession = { id: 'chat-session' };
    mockSearchParams = {
      returnUrl:
        'regentsmobile://portal-return?code=user-a-code&state=user-a-state',
    };
    mockGetPortalPairing.mockResolvedValue({
      paired: false,
      accountLabel: null,
      pairedAt: null,
    });
    let resolveUserA!: (status: {
      paired: boolean;
      accountLabel: string | null;
      pairedAt: string | null;
    }) => void;
    mockCompletePortalPairing.mockImplementation(() => new Promise((resolve) => {
      resolveUserA = resolve;
    }));

    const screen = renderThemed(<ConnectPortalScreen />);
    await waitFor(() => expect(mockCompletePortalPairing).toHaveBeenCalledTimes(1));

    mockRegentsUserId = 'user-b';
    screen.rerender(
      <ThemeProvider>
        <ConnectPortalScreen />
      </ThemeProvider>,
    );
    await waitFor(() => expect(mockGetPortalPairing).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Pair Nous Portal')).toBeTruthy();

    await act(async () => {
      resolveUserA({
        paired: true,
        accountLabel: 'User A account',
        pairedAt: '2026-07-30T12:00:00.000Z',
      });
    });

    expect(screen.getByText('Pair Nous Portal')).toBeTruthy();
    expect(screen.queryByText('Connected')).toBeNull();
    expect(screen.queryByText('Pairing stopped')).toBeNull();
    expect(mockGetPortalPairing).toHaveBeenCalledTimes(2);
    expect(mockRunRegentEventHaptic).not.toHaveBeenCalled();
  });

  it('keeps a newer attempt owned after reload reaches idle and the older completion resolves', async () => {
    mockRegentsUserId = 'user-a';
    mockChatGptSession = { id: 'chat-session' };
    mockSearchParams = {
      returnUrl:
        'regentsmobile://portal-return?code=older-code&state=older-state',
    };
    mockGetPortalPairing.mockResolvedValue({
      paired: false,
      accountLabel: null,
      pairedAt: null,
    });
    let resolveOlder!: (status: {
      paired: boolean;
      accountLabel: string | null;
      pairedAt: string | null;
    }) => void;
    mockCompletePortalPairing.mockImplementation(() => new Promise((resolve) => {
      resolveOlder = resolve;
    }));
    mockStartPortalPairing.mockResolvedValue({
      authorizeUrl: 'https://portal.nousresearch.com/oauth/authorize',
    });
    mockOpenAuthSessionAsync.mockImplementation(() => new Promise(() => {}));

    const screen = renderThemed(<ConnectPortalScreen />);
    await waitFor(() => expect(mockCompletePortalPairing).toHaveBeenCalledTimes(1));

    mockRegentsUserId = 'user-b';
    screen.rerender(
      <ThemeProvider>
        <ConnectPortalScreen />
      </ThemeProvider>,
    );
    await waitFor(() => expect(mockGetPortalPairing).toHaveBeenCalledTimes(2));
    const pairButton = await screen.findByText('Pair Nous Portal');

    fireEvent.press(pairButton);
    expect(await screen.findByText('Finish in Nous Portal')).toBeTruthy();

    await act(async () => {
      resolveOlder({
        paired: true,
        accountLabel: 'Older account',
        pairedAt: '2026-07-30T12:00:00.000Z',
      });
    });

    expect(screen.getByText('Finish in Nous Portal')).toBeTruthy();
    expect(screen.queryByText('Pairing stopped')).toBeNull();
    expect(mockGetPortalPairing).toHaveBeenCalledTimes(2);
    expect(mockRunRegentEventHaptic).not.toHaveBeenCalled();
  });

  it('silently drops a delayed start after the new user status settles', async () => {
    mockRegentsUserId = 'user-a';
    mockChatGptSession = { id: 'chat-session' };
    mockGetPortalPairing
      .mockResolvedValueOnce({
        paired: false,
        accountLabel: null,
        pairedAt: null,
      })
      .mockResolvedValueOnce({
        paired: true,
        accountLabel: 'User B account',
        pairedAt: '2026-07-30T12:01:00.000Z',
      });
    let resolveStart!: (started: { authorizeUrl: string }) => void;
    mockStartPortalPairing.mockImplementation(() => new Promise((resolve) => {
      resolveStart = resolve;
    }));

    const screen = renderThemed(<ConnectPortalScreen />);
    fireEvent.press(await screen.findByText('Pair Nous Portal'));
    await waitFor(() => expect(mockStartPortalPairing).toHaveBeenCalledTimes(1));

    mockRegentsUserId = 'user-b';
    screen.rerender(
      <ThemeProvider>
        <ConnectPortalScreen />
      </ThemeProvider>,
    );
    expect(await screen.findByText(
      'User B account is paired with this Regents account.',
    )).toBeTruthy();

    await act(async () => {
      resolveStart({
        authorizeUrl: 'https://portal.nousresearch.com/oauth/authorize',
      });
    });

    expect(screen.getByText(
      'User B account is paired with this Regents account.',
    )).toBeTruthy();
    expect(screen.queryByText('Pairing stopped')).toBeNull();
    expect(mockGetPortalPairing).toHaveBeenCalledTimes(2);
    expect(mockOpenAuthSessionAsync).not.toHaveBeenCalled();
    expect(mockRunRegentEventHaptic).not.toHaveBeenCalled();
  });

  it('silently drops a delayed disconnect after the new user status settles', async () => {
    mockRegentsUserId = 'user-a';
    mockChatGptSession = { id: 'chat-session' };
    mockGetPortalPairing
      .mockResolvedValueOnce({
        paired: true,
        accountLabel: 'User A account',
        pairedAt: '2026-07-30T12:00:00.000Z',
      })
      .mockResolvedValueOnce({
        paired: true,
        accountLabel: 'User B account',
        pairedAt: '2026-07-30T12:01:00.000Z',
      });
    let resolveDisconnect!: (status: {
      paired: boolean;
      accountLabel: string | null;
      pairedAt: string | null;
    }) => void;
    mockDisconnectPortalPairing.mockImplementation(() => new Promise((resolve) => {
      resolveDisconnect = resolve;
    }));

    const screen = renderThemed(<ConnectPortalScreen />);
    fireEvent.press(await screen.findByText('Disconnect'));
    await waitFor(() => {
      expect(mockDisconnectPortalPairing).toHaveBeenCalledTimes(1);
    });

    mockRegentsUserId = 'user-b';
    screen.rerender(
      <ThemeProvider>
        <ConnectPortalScreen />
      </ThemeProvider>,
    );
    expect(await screen.findByText(
      'User B account is paired with this Regents account.',
    )).toBeTruthy();

    await act(async () => {
      resolveDisconnect({
        paired: false,
        accountLabel: null,
        pairedAt: null,
      });
    });

    expect(screen.getByText(
      'User B account is paired with this Regents account.',
    )).toBeTruthy();
    expect(screen.queryByText('Pairing stopped')).toBeNull();
    expect(mockGetPortalPairing).toHaveBeenCalledTimes(2);
    expect(mockRunRegentEventHaptic).not.toHaveBeenCalled();
  });
});
