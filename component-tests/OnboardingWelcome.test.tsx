import React from 'react';

import { renderThemed } from './helpers/renderThemed';
import OnboardingWelcomeScreen from '@/app/onboarding/index';

// The screen only needs router.push/replace; no navigator is mounted in this lane.
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

describe('OnboardingWelcomeScreen', () => {
  it('renders under ThemeProvider alone (no auth/Privy tree) without throwing', () => {
    // Regression lock for regent-mao2: first-run users reach /onboarding before
    // sign-in, so this screen must mount with only the theme context present.
    const { getByText } = renderThemed(<OnboardingWelcomeScreen />);

    expect(getByText('Existing Hermes Agent')).toBeTruthy();
    expect(getByText('Create Agent in Regents Cloud')).toBeTruthy();
  });
});
