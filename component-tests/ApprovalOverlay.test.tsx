import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

import { ApprovalOverlay } from '@/components/ui/ApprovalOverlay';

const baseProps = {
  visible: true,
  title: 'Approve funding this agent?',
  body: 'This opens the confirm screen.',
  command: 'fund-agent regent=r1 to=0xabc',
  onApprove: () => {},
  onDeny: () => {},
};

describe('ApprovalOverlay', () => {
  it('renders exactly the two choices: Approve once and Deny', () => {
    const { getByText, queryByText } = render(<ApprovalOverlay {...baseProps} />);

    expect(getByText('Approve once')).toBeTruthy();
    expect(getByText('Deny')).toBeTruthy();
    // No session / always-allow grant may ever appear.
    expect(queryByText(/always/i)).toBeNull();
    expect(queryByText(/session/i)).toBeNull();
  });

  it('shows the exact command for review', () => {
    const { getByText } = render(<ApprovalOverlay {...baseProps} />);
    expect(getByText('fund-agent regent=r1 to=0xabc')).toBeTruthy();
  });

  it('calls onApprove (and not onDeny) when Approve once is pressed', () => {
    const onApprove = jest.fn();
    const onDeny = jest.fn();
    const { getByText } = render(
      <ApprovalOverlay {...baseProps} onApprove={onApprove} onDeny={onDeny} />
    );

    fireEvent.press(getByText('Approve once'));
    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onDeny).not.toHaveBeenCalled();
  });

  it('calls onDeny (and not onApprove) when Deny is pressed', () => {
    const onApprove = jest.fn();
    const onDeny = jest.fn();
    const { getByText } = render(
      <ApprovalOverlay {...baseProps} onApprove={onApprove} onDeny={onDeny} />
    );

    fireEvent.press(getByText('Deny'));
    expect(onDeny).toHaveBeenCalledTimes(1);
    expect(onApprove).not.toHaveBeenCalled();
  });
});
