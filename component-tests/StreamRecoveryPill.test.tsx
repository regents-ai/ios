import React from 'react';

import { renderThemed } from './helpers/renderThemed';
import { StreamRecoveryPill } from '@/components/ui/StreamRecoveryPill';

describe('StreamRecoveryPill', () => {
  it('renders nothing while the stream is live', () => {
    const { toJSON } = renderThemed(<StreamRecoveryPill state="live" />);
    expect(toJSON()).toBeNull();
  });

  it('shows a checking message while re-syncing', () => {
    const { getByText } = renderThemed(<StreamRecoveryPill state="checking" />);
    expect(getByText(/checking/i)).toBeTruthy();
  });

  it('shows a reconnecting message during recovery', () => {
    const { getByText } = renderThemed(<StreamRecoveryPill state="reconnecting" />);
    expect(getByText(/reconnecting/i)).toBeTruthy();
  });
});
