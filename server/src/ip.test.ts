import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveClientIp, trustedClientIp } from './ip.js';

test('trustedClientIp prefers the Fly-Client-IP header over req.ip', () => {
  const ip = trustedClientIp({
    headers: {
      'fly-client-ip': '203.0.113.9',
      'x-forwarded-for': '198.51.100.1, 203.0.113.9',
    },
    ip: '198.51.100.1',
    socket: { remoteAddress: '172.16.0.2' },
  });

  assert.equal(ip, '203.0.113.9');
});

test('trustedClientIp falls back to req.ip, then the socket address', () => {
  assert.equal(
    trustedClientIp({ headers: {}, ip: '203.0.113.10', socket: { remoteAddress: '172.16.0.2' } }),
    '203.0.113.10'
  );
  assert.equal(
    trustedClientIp({ headers: {}, socket: { remoteAddress: '203.0.113.11' } }),
    '203.0.113.11'
  );
  assert.equal(trustedClientIp({ headers: {} }), '');
});

test('resolveClientIp sends the Fly-Client-IP value to Coinbase for public clients', async () => {
  const clientIp = await resolveClientIp({
    headers: { 'fly-client-ip': '203.0.113.12' },
    ip: '198.51.100.1',
    socket: { remoteAddress: '172.16.0.2' },
  });

  assert.equal(clientIp, '203.0.113.12');
});
