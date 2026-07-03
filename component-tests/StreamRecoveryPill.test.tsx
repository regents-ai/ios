import { render } from '@testing-library/react-native';
import React from 'react';

import { StreamRecoveryPill } from '@/components/ui/StreamRecoveryPill';

describe('StreamRecoveryPill', () => {
  it('renders nothing while the stream is live', () => {
    const { toJSON } = render(<StreamRecoveryPill state="live" />);
    expect(toJSON()).toBeNull();
  });

  it('shows a checking message while re-syncing', () => {
    const { getByText } = render(<StreamRecoveryPill state="checking" />);
    expect(getByText(/checking/i)).toBeTruthy();
  });

  it('shows a reconnecting message during recovery', () => {
    const { getByText } = render(<StreamRecoveryPill state="reconnecting" />);
    expect(getByText(/reconnecting/i)).toBeTruthy();
  });
});
