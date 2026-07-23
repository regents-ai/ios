import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_DIAL_PETALS,
  DIAL_PETAL_REGISTRY,
  MESSAGE_THREAD_DIAL_PETALS,
  getDialRouteContext,
  resolveDialPetals,
  type DialPetalRegistry,
} from '../components/dial/petalRegistry';

test('the default dial registry contains the five shipping petals and typed rich actions', () => {
  assert.deepEqual(Object.keys(DIAL_PETAL_REGISTRY), ['default', 'messageThread']);
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

test('message threads resolve the five composer actions', () => {
  assert.equal(getDialRouteContext('/message/thread-123'), 'messageThread');
  assert.equal(resolveDialPetals('/message/thread-123'), MESSAGE_THREAD_DIAL_PETALS);
  assert.equal(resolveDialPetals('/(tabs)/wallet'), DEFAULT_DIAL_PETALS);
  assert.deepEqual(
    MESSAGE_THREAD_DIAL_PETALS.map(({ id, label, action }) => ({
      id,
      label,
      kind: action.kind,
      command: action.command,
    })),
    [
      { id: 'voice', label: 'Voice', kind: 'messageComposer', command: 'voice' },
      { id: 'paste', label: 'Paste', kind: 'messageComposer', command: 'paste' },
      { id: 'commands', label: 'Commands', kind: 'messageComposer', command: 'commands' },
      { id: 'keyboard', label: 'Keyboard', kind: 'messageComposer', command: 'keyboard' },
      { id: 'attach', label: 'Attach', kind: 'messageComposer', command: 'scanQr' },
    ]
  );
});

test('Attach exposes only the supported Scan QR action', () => {
  const attach = MESSAGE_THREAD_DIAL_PETALS.find((petal) => petal.id === 'attach');

  assert.ok(attach);
  assert.deepEqual(attach.submenu, [
    {
      id: 'scan-qr',
      label: 'Scan QR',
      icon: 'qr-code-outline',
      action: { kind: 'messageComposer', command: 'scanQr' },
    },
  ]);
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
