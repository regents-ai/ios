import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clearPostAuthDestination,
  resolvePostAuthLanding,
  setPostAuthDestination,
} from '../utils/state/postAuthDestination';

test('sign-in lands on the agents list when no path was chosen', () => {
  clearPostAuthDestination();
  assert.equal(resolvePostAuthLanding(), '/agents');
});

test('a chosen onboarding path survives to the post-sign-in landing', () => {
  clearPostAuthDestination();
  setPostAuthDestination('/onboarding/connect-hermes');
  assert.equal(resolvePostAuthLanding(), '/onboarding/connect-hermes');
});

test('reading the landing does not spend the intent, so racing redirects agree', () => {
  clearPostAuthDestination();
  setPostAuthDestination('/(tabs)/wallet');
  assert.equal(resolvePostAuthLanding(), '/(tabs)/wallet');
  assert.equal(resolvePostAuthLanding(), '/(tabs)/wallet');
});

test('choosing a new path replaces the previous one', () => {
  clearPostAuthDestination();
  setPostAuthDestination('/onboarding/create-cloud-agent');
  setPostAuthDestination('/(tabs)/wallet');
  assert.equal(resolvePostAuthLanding(), '/(tabs)/wallet');
});

test('skipping onboarding clears the intent back to the default landing', () => {
  setPostAuthDestination('/onboarding/connect-hermes');
  clearPostAuthDestination();
  assert.equal(resolvePostAuthLanding(), '/agents');
});
