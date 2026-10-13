import assert from 'node:assert/strict';
import test from 'node:test';

import { verifySignedAgentRequest, type SignedAgentRequest } from './siwaHttpVerifier.js';

const wallet = '0x9fa152B0EAdbFe9A7c5C0a8e1D11784f22669a3e';

const request: SignedAgentRequest = {
  method: 'POST',
  path: '/agent/pair',
  headers: { 'x-agent-wallet-address': wallet, 'content-type': 'application/json' },
  body_digest: 'sha-256=:47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=:',
};

function verifiedPayload(overrides: Record<string, unknown> = {}, principalOverrides: Record<string, unknown> = {}) {
  return {
    code: 'http_envelope_valid',
    data: {
      verified: true,
      walletAddress: wallet,
      chainId: 8453,
      principal: { kind: 'wallet', wallet_address: wallet, chain_id: 8453, audience: 'regents-mobile', ...principalOverrides },
      ...overrides,
    },
  };
}

function answering(status: number, body: unknown): typeof fetch {
  return async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

// Invariant: the SIWA server's answer maps to exactly one outcome, and only
// a Base wallet principal for this audience that matches the request's own
// wallet header counts as verified.
test('the verifier reads each SIWA server answer as one outcome', async () => {
  const verify = (fetchImpl: typeof fetch, timeoutMs?: number) =>
    verifySignedAgentRequest(request, { siwaServerUrl: 'http://siwa.test/', fetchImpl, ...(timeoutMs ? { timeoutMs } : {}) });

  let sent: { url: string; init: RequestInit } | null = null;
  const recording: typeof fetch = async (url, init) => {
    sent = { url: String(url), init: init ?? {} };
    return answering(200, verifiedPayload())(url, init);
  };
  assert.deepEqual(await verify(recording), { kind: 'verified', walletAddress: wallet });
  assert.equal(sent!.url, 'http://siwa.test/api/shared/siwa/http-verify');
  assert.equal((sent!.init.headers as Record<string, string>)['x-siwa-audience'], 'regents-mobile');
  assert.deepEqual(JSON.parse(String(sent!.init.body)), request);

  assert.deepEqual(await verify(answering(401, { error: { code: 'unauthorized' } })), { kind: 'rejected', status: 401 });
  assert.deepEqual(await verify(answering(409, { error: { code: 'request_replayed' } })), { kind: 'replayed' });
  assert.deepEqual(await verify(answering(503, { error: { code: 'down' } })), { kind: 'unavailable', reason: 'status_503' });
  assert.deepEqual(await verify(async () => { throw new TypeError('fetch failed'); }), { kind: 'unavailable', reason: 'unreachable' });

  const hanging: typeof fetch = (_url, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
    });
  assert.deepEqual(await verify(hanging, 10), { kind: 'unavailable', reason: 'timeout' });

  // A 200 whose principal is not a Base wallet for this audience, or whose
  // address differs from the request's wallet header, is a rejection.
  for (const payload of [
    verifiedPayload({ chainId: 1 }, { chain_id: 1 }),
    verifiedPayload({}, { audience: 'patchbay' }),
    verifiedPayload({}, { kind: 'agent' }),
    verifiedPayload({ walletAddress: '0x1111111111111111111111111111111111111111' }),
    verifiedPayload({ verified: false }),
  ]) {
    assert.deepEqual(await verify(answering(200, payload)), { kind: 'rejected', status: 200 });
  }
  const otherWallet = { ...request, headers: { 'x-agent-wallet-address': '0x1111111111111111111111111111111111111111' } };
  assert.deepEqual(
    await verifySignedAgentRequest(otherWallet, { siwaServerUrl: 'http://siwa.test', fetchImpl: answering(200, verifiedPayload()) }),
    { kind: 'rejected', status: 200 },
  );

  assert.deepEqual(await verifySignedAgentRequest(request, { siwaServerUrl: '' }), { kind: 'missing_config', requiredEnv: 'SIWA_SERVER_URL' });
});
