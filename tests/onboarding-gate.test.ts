import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldInterceptForwardNavigation } from '../utils/onboardingGate';

test('gated forward step is intercepted until the critical action completes', () => {
  assert.equal(
    shouldInterceptForwardNavigation({
      from: '/phone-verify',
      to: '/phone-code',
      hasCompletedCriticalAction: false,
      hasBypassed: false,
    }),
    true
  );
  assert.equal(
    shouldInterceptForwardNavigation({
      from: '/email-verify',
      to: '/email-code',
      hasCompletedCriticalAction: false,
      hasBypassed: false,
    }),
    true
  );
});

test('gated forward step advances once the critical action completed', () => {
  assert.equal(
    shouldInterceptForwardNavigation({
      from: '/phone-verify',
      to: '/phone-code',
      hasCompletedCriticalAction: true,
      hasBypassed: false,
    }),
    false
  );
});

test('bypass is an escape hatch that always wins', () => {
  assert.equal(
    shouldInterceptForwardNavigation({
      from: '/phone-verify',
      to: '/phone-code',
      hasCompletedCriticalAction: false,
      hasBypassed: true,
    }),
    false
  );
});

test('non-gated navigation is never intercepted', () => {
  // Backward navigation.
  assert.equal(
    shouldInterceptForwardNavigation({
      from: '/phone-code',
      to: '/phone-verify',
      hasCompletedCriticalAction: false,
      hasBypassed: false,
    }),
    false
  );

  // Unrelated navigation.
  assert.equal(
    shouldInterceptForwardNavigation({
      from: '/agents',
      to: '/wallet',
      hasCompletedCriticalAction: false,
      hasBypassed: false,
    }),
    false
  );

  // Cross-flow pairs are not gated steps.
  assert.equal(
    shouldInterceptForwardNavigation({
      from: '/phone-verify',
      to: '/email-code',
      hasCompletedCriticalAction: false,
      hasBypassed: false,
    }),
    false
  );
});
