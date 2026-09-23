import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clearPostAuthDestination,
  landAfterSignIn,
  resolvePostAuthLanding,
  setPostAuthDestination,
} from '../utils/state/postAuthDestination';

function recordingRouter() {
  const calls: string[] = [];
  return {
    calls,
    replace(href: string) {
      calls.push(`replace ${href}`);
    },
    push(href: string) {
      calls.push(`push ${href}`);
    },
  };
}

test('sign-in lands on the agents list when no path was chosen', () => {
  clearPostAuthDestination();
  assert.equal(resolvePostAuthLanding(), '/agents');
});

test('a chosen onboarding path survives to the post-sign-in landing', () => {
  clearPostAuthDestination();
  setPostAuthDestination('/agent/add');
  assert.equal(resolvePostAuthLanding(), '/agent/add');
});

test('adding an agent after sign-in is pushed over the agents tab so Back and the tab bar work', () => {
  clearPostAuthDestination();
  setPostAuthDestination('/agent/add');
  const router = recordingRouter();
  landAfterSignIn(router);
  assert.deepEqual(router.calls, ['replace /(tabs)/agents', 'push /agent/add']);

  clearPostAuthDestination();
  const plain = recordingRouter();
  landAfterSignIn(plain);
  assert.deepEqual(plain.calls, ['replace /agents']);
});

test('Nous Portal pairing survives the sign-in round trip', () => {
  clearPostAuthDestination();
  setPostAuthDestination('/onboarding/connect-portal');
  assert.equal(resolvePostAuthLanding(), '/onboarding/connect-portal');
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
  setPostAuthDestination('/agent/add');
  clearPostAuthDestination();
  assert.equal(resolvePostAuthLanding(), '/agents');
});
