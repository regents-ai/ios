import React from 'react';
import { StyleSheet } from 'react-native';

import { renderThemed } from './helpers/renderThemed';
import OnboardingWelcomeScreen from '@/app/onboarding/index';

let mockReducedMotion = false;

jest.mock('@/components/motion/useReducedMotion', () => ({
  useReducedMotion: () => mockReducedMotion,
}));

// The screen only needs router.push/replace; no navigator is mounted in this lane.
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

describe('OnboardingWelcomeScreen', () => {
  beforeEach(() => {
    mockReducedMotion = false;
  });

  it('renders under ThemeProvider alone (no auth/Privy tree) without throwing', () => {
    // Regression lock for regent-mao2: first-run users reach /onboarding before
    // sign-in, so this screen must mount with only the theme context present.
    const { getByText } = renderThemed(<OnboardingWelcomeScreen />);

    expect(getByText('Add an agent')).toBeTruthy();
    expect(getByText('Create Agent in Regents Cloud')).toBeTruthy();
  });

  it('places the connect sheet below the hero, never over it', () => {
    const { getByTestId } = renderThemed(<OnboardingWelcomeScreen />);
    const heroStyle = StyleSheet.flatten(getByTestId('onboarding-hero').props.style);
    const sheetStyle = StyleSheet.flatten(getByTestId('onboarding-connect-sheet').props.style);

    expect(heroStyle.position).toBeUndefined();
    expect(sheetStyle.position).toBeUndefined();
  });

  it('renders its large entry surfaces without transforms under reduced motion', () => {
    mockReducedMotion = true;

    const { getByTestId } = renderThemed(<OnboardingWelcomeScreen />);
    const heroStyle = StyleSheet.flatten(getByTestId('onboarding-hero').props.style);
    const sheetStyle = StyleSheet.flatten(getByTestId('onboarding-connect-sheet').props.style);

    expect(heroStyle.opacity).toBe(1);
    expect(heroStyle.transform).toBeUndefined();
    expect(sheetStyle.opacity).toBe(1);
    expect(sheetStyle.transform).toBeUndefined();
  });
});
