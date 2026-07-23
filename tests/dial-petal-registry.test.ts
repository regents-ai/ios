import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_DIAL_PETALS,
  DIAL_PETAL_REGISTRY,
  getDialRouteContext,
  resolveDialPetals,
  type DialPetalRegistry,
} from '../components/dial/petalRegistry';

test('the default dial registry contains the five shipping petals and typed rich actions', () => {
  assert.deepEqual(Object.keys(DIAL_PETAL_REGISTRY), ['default']);
  assert.deepEqual(
    DEFAULT_DIAL_PETALS.map(({ id, label, action }) => ({
      id,
      label,
      kind: action.kind,
      href: 'href' in action ? action.href : undefined,
    })),
    [
      { id: 'voice', label: 'Voice', kind: 'primaryAgentVoice', href: undefined },
      { id: 'profile', label: 'Profile', kind: 'navigate', href: '/settings' },
      { id: 'fund', label: 'Fund', kind: 'navigate', href: '/(tabs)/wallet' },
      { id: 'pay', label: 'Pay', kind: 'navigate', href: '/(tabs)/send' },
      { id: 'message', label: 'Message', kind: 'urgentMessage', href: undefined },
    ]
  );
});

test('Pay exposes only the supported Send submenu action', () => {
  const pay = DEFAULT_DIAL_PETALS.find((petal) => petal.id === 'pay');

  assert.ok(pay);
  assert.deepEqual(pay.submenu, [
    {
      id: 'send',
      label: 'Send',
      icon: 'paper-plane-outline',
      action: { kind: 'navigate', href: '/(tabs)/send' },
    },
  ]);
});

test('registry resolution falls back to default for message threads until one is registered', () => {
  assert.equal(getDialRouteContext('/message/thread-123'), 'messageThread');
  assert.equal(resolveDialPetals('/message/thread-123'), DEFAULT_DIAL_PETALS);
  assert.equal(resolveDialPetals('/(tabs)/wallet'), DEFAULT_DIAL_PETALS);
});

test('pre-auth, onboarding, and verification contexts resolve to no dial petals', () => {
  const hiddenPaths = [
    '/auth/login',
    '/auth/recovery',
    '/onboarding',
    '/onboarding/connect-hermes',
    '/email-verify',
    '/email-code',
    '/phone-verify',
    '/phone-code',
  ];

  for (const pathname of hiddenPaths) {
    assert.equal(getDialRouteContext(pathname), 'hidden');
    assert.deepEqual(resolveDialPetals(pathname), []);
  }
});

test('registry resolution supports a later message-thread petal set without changing its API', () => {
  const threadPetals = [DEFAULT_DIAL_PETALS[4]];
  const registry: DialPetalRegistry = {
    default: DEFAULT_DIAL_PETALS,
    messageThread: threadPetals,
  };

  assert.equal(resolveDialPetals('/message/thread-123', registry), threadPetals);
  assert.equal(resolveDialPetals('/message', registry), DEFAULT_DIAL_PETALS);
});
