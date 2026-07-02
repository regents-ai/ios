import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isVerificationResendReady,
  nextVerificationResendSecond,
  VERIFICATION_RESEND_SECONDS,
} from '../utils/verificationResendTimer';

test('verification resend countdown starts at the shared duration', () => {
  assert.equal(VERIFICATION_RESEND_SECONDS, 30);
});

test('verification resend countdown decrements once per tick', () => {
  assert.equal(nextVerificationResendSecond(30), 29);
  assert.equal(nextVerificationResendSecond(1), 0);
});

test('verification resend countdown never goes below zero', () => {
  assert.equal(nextVerificationResendSecond(0), 0);
  assert.equal(nextVerificationResendSecond(-4), 0);
  assert.equal(nextVerificationResendSecond(Number.NaN), 0);
});

test('verification resend readiness only opens at zero or below', () => {
  assert.equal(isVerificationResendReady(2), false);
  assert.equal(isVerificationResendReady(0), true);
  assert.equal(isVerificationResendReady(-1), true);
});
