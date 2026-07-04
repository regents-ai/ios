import test from 'node:test';
import assert from 'node:assert/strict';

import { outcomeForClaimError, outcomeForScan } from '../utils/agentLink/connectFlow';
import { ApiError } from '../utils/apiError';

const validQr = JSON.stringify({ v: 1, kind: 'regents-agent-link', code: 'ABC234' });

test('a valid scan moves to submitting with the parsed code', () => {
  const outcome = outcomeForScan(validQr);
  assert.equal(outcome.kind, 'submit');
  if (outcome.kind === 'submit') {
    assert.equal(outcome.phase, 'submitting');
    assert.equal(outcome.code, 'ABC234');
  }
});

test('an unrecognized scan returns to idle with friendly copy', () => {
  const outcome = outcomeForScan('not a code');
  assert.equal(outcome.kind, 'reject');
  if (outcome.kind === 'reject') {
    assert.equal(outcome.phase, 'idle');
    assert.match(outcome.alert.message, /agent code/);
  }
});

test('an expired code (409) surfaces the relayed backend message verbatim and returns to idle', () => {
  // The backend relays Platform's person-facing conflict copy on a 409;
  // requestJson turns that into an ApiError carrying the server message.
  const platformMessage = 'This code has expired. Generate a new one on your agent.';
  const expired = new ApiError('unknown', platformMessage, 409);
  const outcome = outcomeForClaimError(expired);
  assert.equal(outcome.phase, 'idle');
  assert.equal(outcome.alert.message, platformMessage);
});

test('an already-connected agent (409) surfaces the relayed backend message verbatim', () => {
  const platformMessage = 'This agent is already connected to a different account.';
  const outcome = outcomeForClaimError(new ApiError('unknown', platformMessage, 409));
  assert.equal(outcome.phase, 'idle');
  assert.equal(outcome.alert.message, platformMessage);
});

test('an unrecognized code (404) surfaces the backend message and returns to idle', () => {
  const backendMessage = "That code wasn't recognized. Generate a fresh one on your agent and scan it again.";
  const outcome = outcomeForClaimError(new ApiError('not-found', backendMessage, 404));
  assert.equal(outcome.phase, 'idle');
  assert.equal(outcome.alert.message, backendMessage);
});

test('network trouble surfaces reconnect copy and returns to idle', () => {
  const outcome = outcomeForClaimError(new TypeError('Network request failed'));
  assert.equal(outcome.phase, 'idle');
  assert.match(outcome.alert.message, /internet connection/);
});
