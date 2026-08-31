import React from 'react';
import { AccessibilityInfo } from 'react-native';

import { renderThemed } from './helpers/renderThemed';
import { StreamRecoveryPill } from '@/components/ui/StreamRecoveryPill';
import { ThemeProvider } from '@/theme/ThemeProvider';

describe('StreamRecoveryPill', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders nothing while the stream is live', () => {
    const { toJSON } = renderThemed(<StreamRecoveryPill state="live" />);
    expect(toJSON()).toBeNull();
  });

  it('shows a checking message without a spurious mount announcement', () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions');
    const { getByRole, getByText } = renderThemed(<StreamRecoveryPill state="checking" />);
    expect(getByText(/checking/i)).toBeTruthy();
    expect(getByRole('status')).toBeTruthy();
    expect(announce).not.toHaveBeenCalled();
  });

  it('queues recovery status changes for VoiceOver', () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions');
    const screen = renderThemed(<StreamRecoveryPill state="checking" />);

    screen.rerender(
      <ThemeProvider>
        <StreamRecoveryPill state="reconnecting" />
      </ThemeProvider>,
    );

    const { getByText } = screen;
    expect(getByText(/reconnecting/i)).toBeTruthy();
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith('Reconnecting...', { queue: true });
  });
});
