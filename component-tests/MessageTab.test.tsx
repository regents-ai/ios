import { act, fireEvent, waitFor } from '@testing-library/react-native';
import React from 'react';

import MessageTab from '@/app/(tabs)/message';
import type { MessageThread } from '@/types/regents';
import { renderThemed } from './helpers/renderThemed';

const mockListMessageThreads = jest.fn<Promise<MessageThread[]>, []>();
const mockPush = jest.fn();

jest.mock('@/utils/regentApi/client', () => ({
  regentApi: {
    listMessageThreads: () => mockListMessageThreads(),
  },
}));

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void) => {
    const ReactModule = jest.requireActual<typeof import('react')>('react');
    ReactModule.useEffect(callback, [callback]);
  },
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@/components/navigation/ProfileButton', () => ({
  ProfileButton: () => null,
}));

function thread(
  id: string,
  status: MessageThread['status'],
  lastUpdatedAt: string,
): MessageThread {
  return {
    id,
    platformThreadId: `platform-${id}`,
    title: `${id} thread`,
    agentId: `agent-${id}`,
    agentName: `${id} agent`,
    source: 'platform_rwr',
    status,
    latestNote: `${id} update`,
    lastUpdatedAt,
  };
}

describe('MessageTab', () => {
  beforeEach(() => {
    mockListMessageThreads.mockReset();
    mockPush.mockReset();
  });

  it('orders threads by attention state and exposes complete row labels', async () => {
    mockListMessageThreads.mockResolvedValue([
      thread('idle', 'idle', '2026-08-30T10:00:00.000Z'),
      thread('running', 'running', '2026-08-30T11:00:00.000Z'),
      thread('failed', 'failed', '2026-08-30T12:00:00.000Z'),
      thread('waiting', 'waiting', '2026-08-30T09:00:00.000Z'),
    ]);

    const { findByText, getAllByRole } = renderThemed(<MessageTab />);
    await findByText('waiting thread');

    const rows = getAllByRole('button').filter(
      (button) => button.props.accessibilityHint === 'Opens this conversation',
    );
    expect(rows.map((row) => row.props.accessibilityLabel.split(',')[0])).toEqual([
      'waiting agent',
      'failed agent',
      'running agent',
      'idle agent',
    ]);
    expect(rows[0].props.accessibilityLabel).toContain('Approval');
  });

  it('keeps load errors distinct from the empty state', async () => {
    mockListMessageThreads.mockRejectedValue(new TypeError('Network request failed'));

    const { findByText, queryByText } = renderThemed(<MessageTab />);

    expect(await findByText("Can't reach the network")).toBeTruthy();
    expect(queryByText('No messages yet')).toBeNull();
  });

  it('marks manual refresh as busy and disabled until it finishes', async () => {
    let resolveRefresh: (threads: MessageThread[]) => void = () => undefined;
    const refreshPromise = new Promise<MessageThread[]>((resolve) => {
      resolveRefresh = resolve;
    });
    mockListMessageThreads.mockResolvedValueOnce([]).mockReturnValueOnce(refreshPromise);

    const { findByText, getByLabelText } = renderThemed(<MessageTab />);
    await findByText('No messages yet');

    expect(getByLabelText('Refresh messages').props.accessibilityRole).toBe('button');
    fireEvent.press(getByLabelText('Refresh messages'));
    await waitFor(() =>
      expect(getByLabelText('Refresh messages').props.accessibilityState).toEqual({
        busy: true,
        disabled: true,
      }),
    );

    await act(async () => {
      resolveRefresh([]);
      await refreshPromise;
    });

    await waitFor(() =>
      expect(getByLabelText('Refresh messages').props.accessibilityState).toEqual({
        busy: false,
        disabled: false,
      }),
    );
  });
});
