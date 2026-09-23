import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_DIAL_PETALS,
  DIAL_PETAL_REGISTRY,
  getDialRouteContext,
  resolveDialPetals,
} from '../components/dial/petalRegistry';

test('the default dial registry contains the four shipping petals', () => {
  assert.deepEqual(Object.keys(DIAL_PETAL_REGISTRY), ['default']);
  assert.deepEqual(
    DEFAULT_DIAL_PETALS.map(({ id, label, action }) => ({ id, label, href: action.href })),
    [
      { id: 'agents', label: 'Agents', href: '/(tabs)/agents' },
      { id: 'profile', label: 'Profile', href: '/settings' },
      { id: 'fund', label: 'Fund', href: '/(tabs)/wallet' },
      { id: 'pay', label: 'Pay', href: '/(tabs)/send' },
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

test('signed-in screens resolve the default petals', () => {
  assert.equal(getDialRouteContext('/(tabs)/wallet'), 'default');
  assert.equal(resolveDialPetals('/(tabs)/wallet'), DEFAULT_DIAL_PETALS);
  assert.equal(resolveDialPetals('/agent/add'), DEFAULT_DIAL_PETALS);
});

test('pre-auth, onboarding, verification and send contexts resolve to no dial petals', () => {
  const hiddenPaths = [
    '/auth/login',
    '/auth/recovery',
    '/onboarding',
    '/onboarding/connect-portal',
    '/email-verify',
    '/email-code',
    '/phone-verify',
    '/phone-code',
    '/send',
    '/wallet/send',
  ];

  for (const pathname of hiddenPaths) {
    assert.equal(getDialRouteContext(pathname), 'hidden');
    assert.deepEqual(resolveDialPetals(pathname), []);
  }
});
