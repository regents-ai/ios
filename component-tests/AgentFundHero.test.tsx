import React from 'react';

import { renderThemed } from './helpers/renderThemed';
import { AgentFundHero } from '@/components/agents/AgentFundHero';

let mockReducedMotion = false;

jest.mock('@/components/motion/useReducedMotion', () => ({
  useReducedMotion: () => mockReducedMotion,
}));

const mockWithRepeat = jest.fn();

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  return {
    ...actual,
    __esModule: true,
    default: actual.default,
    withRepeat: (...args: unknown[]) => {
      mockWithRepeat(...args);
      return actual.withRepeat(...args);
    },
  };
});

describe('AgentFundHero', () => {
  beforeEach(() => {
    mockReducedMotion = false;
    mockWithRepeat.mockClear();
  });

  it('shows the headline and reads the agent logos as one sentence', () => {
    const { getByText, getByLabelText } = renderThemed(<AgentFundHero />);

    expect(getByText('Fund your personal agent’s wallet in seconds')).toBeTruthy();
    expect(getByLabelText('Works with Muse, Hermes, Grok Bot, Claude and Codex')).toBeTruthy();
  });

  it('keeps the crown rows away from screen readers', () => {
    const { UNSAFE_root } = renderThemed(<AgentFundHero />);
    const hiddenGroups = UNSAFE_root.findAll(
      (node) => node.props.importantForAccessibility === 'no-hide-descendants' && node.props.accessibilityElementsHidden === true,
    );

    expect(hiddenGroups.length).toBeGreaterThan(0);
  });

  it('slides all three crown rows', () => {
    renderThemed(<AgentFundHero />);

    expect(mockWithRepeat).toHaveBeenCalledTimes(3);
  });

  it('holds the crown rows still when Reduce Motion is on', () => {
    mockReducedMotion = true;

    renderThemed(<AgentFundHero />);

    expect(mockWithRepeat).not.toHaveBeenCalled();
  });
});
