import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CONSENT_CHOICES,
  consentIsStateless,
  mayProceedAfterConsent,
  requiresApproval,
  type ConsentOutcome,
} from '../utils/approvalConsent';

test('money actions require the approval overlay', () => {
  assert.equal(requiresApproval('fund-agent'), true);
  assert.equal(requiresApproval('send'), true);
  assert.equal(requiresApproval('stake'), true);
  assert.equal(requiresApproval('return-funds'), true);
});

test('approve-once proceeds exactly once; deny never proceeds', () => {
  assert.equal(mayProceedAfterConsent('approve-once'), true);
  assert.equal(mayProceedAfterConsent('deny'), false);
});

test('the consent model offers ONLY once and deny — no session, no always-allow', () => {
  const outcomes = CONSENT_CHOICES.map((choice) => choice.outcome).sort();
  assert.deepEqual(outcomes, ['approve-once', 'deny']);

  // No grant type beyond these two may exist.
  const allowed: ConsentOutcome[] = ['approve-once', 'deny'];
  for (const choice of CONSENT_CHOICES) {
    assert.ok(allowed.includes(choice.outcome));
  }
  assert.match(CONSENT_CHOICES.map((c) => c.outcome).join(','), /^approve-once,deny$/);
});

test('there is no "always" or "session" grant anywhere in the choices', () => {
  const joined = JSON.stringify(CONSENT_CHOICES).toLowerCase();
  assert.doesNotMatch(joined, /always|session|remember|forever/);
});

test('consent is stateless by construction — nothing is persisted', () => {
  assert.equal(consentIsStateless(), true);
  // Two consecutive approvals are independent: each is a fresh once-grant.
  assert.equal(mayProceedAfterConsent('approve-once'), true);
  assert.equal(mayProceedAfterConsent('approve-once'), true);
});
