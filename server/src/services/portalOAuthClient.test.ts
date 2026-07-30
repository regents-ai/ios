import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createPortalOAuthClient,
  PORTAL_REDIRECT_URI,
} from './portalOAuthClient.js';

const config = {
  clientId: 'portal-client-test',
  baseUrl: 'https://portal.nousresearch.com',
};

test('Portal authorization uses the registered redirect and PKCE S256', () => {
  const client = createPortalOAuthClient({
    config,
    fetchImpl: async () => {
      throw new Error('authorization must not call Portal');
    },
  });

  const request = client.createAuthorizationRequest();
  const url = new URL(request.authorizeUrl);

  assert.equal(url.origin, 'https://portal.nousresearch.com');
  assert.equal(url.pathname, '/oauth/authorize');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('client_id'), config.clientId);
  assert.equal(url.searchParams.get('redirect_uri'), PORTAL_REDIRECT_URI);
  assert.equal(url.searchParams.get('scope'), 'mcp:manage_agents');
  assert.equal(url.searchParams.get('state'), request.state);
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(url.searchParams.get('code_challenge'));
  assert.equal(url.searchParams.has('code_verifier'), false);
  assert.ok(request.verifier.length >= 43);
});

test('Portal token exchange stays on the pinned endpoint and returns no access token', async () => {
  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;
  const client = createPortalOAuthClient({
    config,
    fetchImpl: async (url, init) => {
      capturedUrl = String(url);
      capturedInit = init;
      return new Response(JSON.stringify({
        access_token: 'must-not-leave-client',
        refresh_token: 'server-refresh',
        account_label: 'Portal account',
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });

  const result = await client.exchangeCode({
    code: 'returned-code',
    verifier: 'stored-verifier',
  });

  assert.equal(capturedUrl, 'https://portal.nousresearch.com/api/oauth/token');
  assert.equal(capturedInit?.method, 'POST');
  assert.equal(capturedInit?.redirect, 'error');
  const body = new URLSearchParams(String(capturedInit?.body));
  assert.equal(body.get('client_id'), config.clientId);
  assert.equal(body.get('redirect_uri'), PORTAL_REDIRECT_URI);
  assert.equal(body.get('code'), 'returned-code');
  assert.equal(body.get('code_verifier'), 'stored-verifier');
  assert.deepEqual(result, {
    kind: 'ok',
    refreshToken: 'server-refresh',
    accountLabel: 'Portal account',
  });
  assert.equal('accessToken' in result, false);
});

test('Portal exchange failures expose no upstream payload', async () => {
  const client = createPortalOAuthClient({
    config,
    fetchImpl: async () => new Response(JSON.stringify({
      error: 'invalid_grant',
      refresh_token: 'do-not-return',
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    }),
  });

  assert.deepEqual(
    await client.exchangeCode({ code: 'bad-code', verifier: 'verifier' }),
    { kind: 'upstream_error' },
  );
});

test('Portal rejects empty and whitespace-only refresh tokens from successful responses', async () => {
  for (const refreshToken of ['', '   ']) {
    const client = createPortalOAuthClient({
      config,
      fetchImpl: async () => new Response(JSON.stringify({
        refresh_token: refreshToken,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    });

    assert.deepEqual(
      await client.exchangeCode({ code: 'returned-code', verifier: 'verifier' }),
      { kind: 'upstream_error' },
    );
  }
});
