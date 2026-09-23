import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ApiError,
  apiFailureKindForStatus,
  describeApiError,
  privacySafeLogCategory,
} from '../utils/apiError';

test('apiFailureKindForStatus classifies the taxonomy', () => {
  assert.equal(apiFailureKindForStatus(401), 'auth');
  assert.equal(apiFailureKindForStatus(403), 'permission');
  assert.equal(apiFailureKindForStatus(404), 'not-found');
  assert.equal(apiFailureKindForStatus(429), 'rate-limited');
  assert.equal(apiFailureKindForStatus(500), 'server');
  assert.equal(apiFailureKindForStatus(503), 'server');
  assert.equal(apiFailureKindForStatus(422), 'unknown');
  assert.equal(apiFailureKindForStatus(200), 'invalid-response');
});

test('describeApiError prefers the server-provided message on an ApiError', () => {
  const described = describeApiError(new ApiError('rate-limited', 'Wait 30 seconds before staking again.', 429));
  assert.equal(described.title, 'Too many attempts');
  assert.equal(described.message, 'Wait 30 seconds before staking again.');
});

test('describeApiError humanizes network drops from fetch TypeErrors', () => {
  const described = describeApiError(new TypeError('Network request failed'));
  assert.equal(described.title, 'No connection');
  assert.match(described.message, /connection/i);
});

test('describeApiError gives what-to-do copy for unknown failures', () => {
  const described = describeApiError('boom');
  assert.equal(described.title, 'That did not work');
  assert.match(described.message, /try again/i);
});

test('server copy never claims a transaction state, only how to verify', () => {
  const described = describeApiError(new ApiError('server', '', 500));
  assert.doesNotMatch(described.message, /failed|succeeded|was sent|refunded/i);
  assert.match(described.message, /check your recent activity/i);
});

test('privacySafeLogCategory carries kind and status only', () => {
  const failure = new ApiError('server', 'Wallet 0xabc lost $12 sending to sean@regents.sh', 503);
  const category = privacySafeLogCategory(failure);
  assert.equal(category, 'api.server.503');
  assert.doesNotMatch(category, /0xabc|\$12|sean/);
});

test('privacySafeLogCategory labels non-API errors without leaking messages', () => {
  assert.equal(privacySafeLogCategory(new TypeError('fetch to https://x/y?token=abc failed')), 'api.network');
  assert.equal(privacySafeLogCategory(new Error('anything')), 'api.unknown');
});

test('describeApiError tells the user plainly when they cancelled in their wallet', () => {
  const cancelled = Object.assign(new Error('The user rejected the request.'), { code: 4001 });
  const described = describeApiError(cancelled);
  assert.equal(described.title, 'Cancelled in your wallet');
  assert.match(described.message, /nothing was sent/i);
  assert.equal(privacySafeLogCategory(cancelled), 'api.wallet-cancelled');
});

test('describeApiError explains a network-fee shortfall reported by the bundler', () => {
  const shortfall = new Error('UserOperation reverted during simulation', {
    cause: { message: "AA21 didn't pay prefund" },
  });
  const described = describeApiError(shortfall);
  assert.equal(described.title, 'Not enough ETH for the network fee');
  assert.match(described.message, /ETH/);
});

test('describeApiError names other wallet-side refusals instead of the generic copy', () => {
  const described = describeApiError(new Error('Failed to send user operation: bundler returned an error'));
  assert.equal(described.title, 'Your wallet could not send this');
  assert.doesNotMatch(described.message, /try again in a moment/i);
});
