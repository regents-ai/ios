import assert from 'node:assert/strict';
import test from 'node:test';

import { mergeHeadersUnderSecurity } from '../utils/requestHeaderPrecedence';

test('caller headers are preserved when they do not collide', () => {
  const headers = mergeHeadersUnderSecurity(
    { 'Content-Type': 'application/json', 'Idempotency-Key': 'abc' },
    { Authorization: 'Bearer token-1' }
  );

  assert.equal(headers.get('Content-Type'), 'application/json');
  assert.equal(headers.get('Idempotency-Key'), 'abc');
  assert.equal(headers.get('Authorization'), 'Bearer token-1');
});

test('security headers always win over caller-supplied values', () => {
  const headers = mergeHeadersUnderSecurity(
    { Authorization: 'Bearer attacker-controlled' },
    { Authorization: 'Bearer token-1' }
  );

  assert.equal(headers.get('Authorization'), 'Bearer token-1');
});

test('security headers win regardless of caller header casing or shape', () => {
  const fromRecord = mergeHeadersUnderSecurity(
    { authorization: 'Bearer lowercase' },
    { Authorization: 'Bearer token-1' }
  );
  assert.equal(fromRecord.get('Authorization'), 'Bearer token-1');

  const fromHeaders = mergeHeadersUnderSecurity(
    new Headers({ Authorization: 'Bearer headers-instance' }),
    { Authorization: 'Bearer token-1' }
  );
  assert.equal(fromHeaders.get('Authorization'), 'Bearer token-1');

  const fromEntries = mergeHeadersUnderSecurity(
    [['Authorization', 'Bearer entries']],
    { Authorization: 'Bearer token-1' }
  );
  assert.equal(fromEntries.get('Authorization'), 'Bearer token-1');
});

test('missing caller headers still produce the security headers', () => {
  const headers = mergeHeadersUnderSecurity(undefined, { Authorization: 'Bearer token-1' });
  assert.equal(headers.get('Authorization'), 'Bearer token-1');
});
