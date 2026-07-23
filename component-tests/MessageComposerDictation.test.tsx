import { act, fireEvent, waitFor } from '@testing-library/react-native';
import React from 'react';

import MessageDetailScreen from '@/app/message/[id]';
import { renderThemed } from '@/component-tests/helpers/renderThemed';
import {
  resetMessageComposerBridgeForTest,
  runMessageComposerAction,
} from '@/utils/messageComposerBridge';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockGetMessageThread = jest.fn();
const mockGetMessageThreadEvents = jest.fn();
const mockSpeechHandlers: Record<string, Set<(event: any) => void>> = {};
let mockFocusCleanup: (() => void) | null = null;

jest.mock('expo-router', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  return {
    useFocusEffect: (callback: () => void | (() => void)) => {
      ReactModule.useEffect(() => {
        const cleanup = callback();
        if (typeof cleanup === 'function') {
          mockFocusCleanup = cleanup;
        }
        return () => {
          if (mockFocusCleanup === cleanup) {
            mockFocusCleanup = null;
          }
          cleanup?.();
        };
      }, [callback]);
    },
    useLocalSearchParams: () => ({ id: 'thread-123' }),
    useRouter: () => ({
      back: mockBack,
      push: mockPush,
      replace: mockReplace,
    }),
  };
});

jest.mock('expo-speech-recognition', () => ({
  ExpoSpeechRecognitionModule: {
    abort: jest.fn(),
    isRecognitionAvailable: jest.fn(() => true),
    requestPermissionsAsync: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
    supportsOnDeviceRecognition: jest.fn(() => true),
  },
  useSpeechRecognitionEvent: (
    event: string,
    handler: (payload: any) => void
  ) => {
    const ReactModule = jest.requireActual<typeof import('react')>('react');
    ReactModule.useEffect(() => {
      const handlers =
        mockSpeechHandlers[event] ??
        (mockSpeechHandlers[event] = new Set());
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    }, [event, handler]);
  },
}));

jest.mock('@/utils/regentApi/client', () => ({
  regentApi: {
    getMessageThread: (...args: unknown[]) => mockGetMessageThread(...args),
    getMessageThreadEvents: (...args: unknown[]) =>
      mockGetMessageThreadEvents(...args),
    resolveMessageThreadApproval: jest.fn(),
    sendMessageThreadMessage: jest.fn(),
  },
}));

jest.mock('@/components/message/MessageQrScannerModal', () => ({
  MessageQrScannerModal: () => null,
}));

describe('message composer dictation lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMessageComposerBridgeForTest();
    mockFocusCleanup = null;
    for (const handlers of Object.values(mockSpeechHandlers)) {
      handlers.clear();
    }
    mockGetMessageThread.mockResolvedValue({
      id: 'thread-123',
      agentName: 'Regent',
      composerPlaceholder: 'Message this agent...',
      latestNote: '',
      status: 'idle',
      title: 'Test thread',
    });
    mockGetMessageThreadEvents.mockResolvedValue({
      events: [],
      latestEventId: '',
    });
    jest
      .mocked(ExpoSpeechRecognitionModule.requestPermissionsAsync)
      .mockResolvedValue({ granted: true } as never);
  });

  afterEach(() => {
    resetMessageComposerBridgeForTest();
  });

  async function renderComposer() {
    const screen = renderThemed(<MessageDetailScreen />);
    const input = await screen.findByPlaceholderText('Message this agent...');
    return { input, screen };
  }

  async function startVoice() {
    act(() => {
      expect(runMessageComposerAction('voice')).toBe(true);
    });
    await waitFor(() => {
      expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalledTimes(1);
    });
  }

  function emitSpeechEvent(event: string, payload: any) {
    for (const handler of [...(mockSpeechHandlers[event] ?? [])]) {
      handler(payload);
    }
  }

  it('keeps typed text intact while partials replace only the dictation segment', async () => {
    const { input } = await renderComposer();
    fireEvent.changeText(input, 'Typed before  typed after');
    fireEvent(input, 'selectionChange', {
      nativeEvent: { selection: { start: 13, end: 13 } },
    });

    await startVoice();
    await waitFor(() => {
      expect(input.props.editable).toBe(false);
    });
    expect(input.props.value).toBe('Typed before  typed after');

    act(() => {
      emitSpeechEvent('result', {
        results: [{ transcript: 'Regent' }],
      });
    });
    expect(input.props.value).toBe('Typed before Regent typed after');

    act(() => {
      emitSpeechEvent('result', {
        results: [{ transcript: 'Regent to review' }],
      });
    });
    expect(input.props.value).toBe(
      'Typed before Regent to review typed after'
    );

    act(() => {
      input.props.onPressIn({ nativeEvent: {} });
    });
    expect(ExpoSpeechRecognitionModule.stop).toHaveBeenCalledTimes(1);
    expect(input.props.value).toBe(
      'Typed before Regent to review typed after'
    );
  });

  it('aborts active recognition when the router focus lifecycle loses focus', async () => {
    const { input, screen } = await renderComposer();
    await startVoice();
    await waitFor(() => {
      expect(screen.getByText('Listening…')).toBeTruthy();
      expect(input.props.editable).toBe(false);
    });

    act(() => {
      mockFocusCleanup?.();
    });

    expect(ExpoSpeechRecognitionModule.abort).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Listening…')).toBeNull();
    expect(input.props.editable).toBe(true);
  });

  it("keeps B's dictation alive when mounted, unfocused A receives B's speech events", async () => {
    const threadA = await renderComposer();
    act(() => {
      mockFocusCleanup?.();
    });

    const threadB = await renderComposer();
    await startVoice();

    act(() => {
      emitSpeechEvent('start', {});
      emitSpeechEvent('result', {
        results: [{ transcript: 'Owned by B' }],
      });
    });

    expect(ExpoSpeechRecognitionModule.abort).not.toHaveBeenCalled();
    expect(threadA.input.props.value).toBe('');
    expect(threadA.input.props.editable).toBe(true);
    expect(threadB.input.props.value).toBe('Owned by B');
    expect(threadB.input.props.editable).toBe(false);
    expect(threadB.screen.getByText('Listening…')).toBeTruthy();

    threadB.screen.unmount();
    threadA.screen.unmount();
  });

  it('does not start recognition when permission resolves after focus loss', async () => {
    let resolvePermission: (value: { granted: boolean }) => void =
      () => undefined;
    jest
      .mocked(ExpoSpeechRecognitionModule.requestPermissionsAsync)
      .mockReturnValue(
        new Promise((resolve) => {
          resolvePermission = resolve;
        }) as never
      );
    await renderComposer();

    expect(runMessageComposerAction('voice')).toBe(true);
    act(() => {
      mockFocusCleanup?.();
    });
    act(() => {
      resolvePermission({ granted: true });
    });
    await Promise.resolve();
    await waitFor(() => {
      expect(
        ExpoSpeechRecognitionModule.requestPermissionsAsync
      ).toHaveBeenCalledTimes(1);
    });

    expect(ExpoSpeechRecognitionModule.start).not.toHaveBeenCalled();
  });

  it('preserves a non-empty draft when Commands cannot open safely', async () => {
    const { input } = await renderComposer();
    fireEvent.changeText(input, 'Keep this draft');

    expect(runMessageComposerAction('commands')).toBe(false);
    expect(input.props.value).toBe('Keep this draft');
  });

  it('preserves the slash draft when a command opens its confirm screen', async () => {
    const { input, screen } = await renderComposer();
    fireEvent.changeText(input, '/');

    fireEvent.press(screen.getByText('/send'));

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(input.props.value).toBe('/');
  });
});
