import test from 'node:test';
import assert from 'node:assert/strict';

import { ApiError } from '../utils/apiError';
import {
  createLocalHermesVoiceSession,
  gatewayDisplayLabel,
  localSessionUrl,
  parsePairingPayload,
  resolveVoiceMode,
  type LocalVoiceGateway,
} from '../utils/voice/localGateway';

const AGENT_WALLET = '0x1234567890abcdef1234567890ABCDEF12345678';
const GATEWAY: LocalVoiceGateway = {
  baseUrl: 'http://192.168.1.20:8787',
  token: 'pair-token-abc',
  agentWallet: '0x1234567890abcdef1234567890abcdef12345678',
};

const sessionRequest = {
  voice: 'marin',
  reasoning_effort: 'low' as const,
  preferred_transport: 'webrtc' as const,
  device_capabilities: ['ios_status'],
};

test('parsePairingPayload accepts a valid { baseUrl, token, agentWallet }, trims the slash, and lowercases the wallet', () => {
  const gateway = parsePairingPayload(
    JSON.stringify({ baseUrl: 'http://10.0.0.5:8787/', token: 't1', agentWallet: AGENT_WALLET }),
  );
  assert.deepEqual(gateway, {
    baseUrl: 'http://10.0.0.5:8787',
    token: 't1',
    agentWallet: '0x1234567890abcdef1234567890abcdef12345678',
  });
});

test('parsePairingPayload requires agentWallet', () => {
  assert.equal(
    parsePairingPayload(JSON.stringify({ baseUrl: 'http://x:8787', token: 't' })),
    null,
    'no agentWallet',
  );
  assert.equal(
    parsePairingPayload(JSON.stringify({ baseUrl: 'http://x:8787', token: 't', agentWallet: 'not-an-address' })),
    null,
    'malformed agentWallet',
  );
});

test('parsePairingPayload rejects non-JSON, missing fields, and non-URL baseUrls', () => {
  assert.equal(parsePairingPayload('not json'), null);
  assert.equal(
    parsePairingPayload(JSON.stringify({ baseUrl: 'http://x:8787', agentWallet: AGENT_WALLET })),
    null,
    'no token',
  );
  assert.equal(
    parsePairingPayload(JSON.stringify({ token: 't', agentWallet: AGENT_WALLET })),
    null,
    'no baseUrl',
  );
  assert.equal(
    parsePairingPayload(JSON.stringify({ baseUrl: 'x:8787', token: 't', agentWallet: AGENT_WALLET })),
    null,
    'not http(s)',
  );
  assert.equal(
    parsePairingPayload(JSON.stringify({ baseUrl: 'http://x', token: '  ', agentWallet: AGENT_WALLET })),
    null,
    'blank token',
  );
});

test('resolveVoiceMode: a self-run agent with a paired computer talks locally', () => {
  assert.equal(
    resolveVoiceMode({ runtimeKind: 'self_hosted', hasPairedGateway: true, hostedAccountSatisfied: false }),
    'local',
    'a paired self-run agent uses the local gateway and skips the hosted account gate',
  );
});

test('resolveVoiceMode: a self-run agent with no paired computer leads to pairing', () => {
  assert.equal(
    resolveVoiceMode({ runtimeKind: 'self_hosted', hasPairedGateway: false, hostedAccountSatisfied: true }),
    'pair',
  );
});

test('resolveVoiceMode: a hosted agent uses the hosted path, gated on its ChatGPT account', () => {
  assert.equal(
    resolveVoiceMode({ runtimeKind: 'hosted', hasPairedGateway: false, hostedAccountSatisfied: true }),
    'hosted',
  );
  assert.equal(
    resolveVoiceMode({ runtimeKind: 'hosted', hasPairedGateway: false, hostedAccountSatisfied: false }),
    'hosted-connect',
  );
});

test('localSessionUrl and label are derived without exposing the token', () => {
  assert.equal(localSessionUrl(GATEWAY), 'http://192.168.1.20:8787/hermes/voice/session');
  const label = gatewayDisplayLabel(GATEWAY);
  assert.equal(label, '192.168.1.20:8787');
  assert.ok(!label.includes('pair-token-abc'), 'label never contains the token');
});

test('createLocalHermesVoiceSession sends the Bearer token and returns the HermesVoiceSession', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(
      JSON.stringify({
        session_id: 's1',
        agent_id: 'local-hermes',
        expires_at: 'now',
        realtime: {
          provider: 'openai-realtime',
          model: 'gpt-realtime-2',
          client_secret: 'ek_secret',
          client_secret_expires_at: 'now',
          calls_url: 'https://api.openai.com/v1/realtime/calls',
        },
        tools: [],
      }),
      { status: 200 },
    );
  }) as typeof fetch;

  try {
    const session = await createLocalHermesVoiceSession({ gateway: GATEWAY, session: sessionRequest });
    assert.equal(session.realtime.model, 'gpt-realtime-2');
    assert.equal(session.realtime.provider, 'openai-realtime');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'http://192.168.1.20:8787/hermes/voice/session');
    assert.equal((calls[0].init.headers as Record<string, string>).Authorization, 'Bearer pair-token-abc');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('an unreachable gateway becomes a humanized network ApiError (no token leak)', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new TypeError('Network request failed');
  }) as typeof fetch;

  try {
    await createLocalHermesVoiceSession({ gateway: GATEWAY, session: sessionRequest });
    assert.fail('should have thrown');
  } catch (error) {
    assert.ok(error instanceof ApiError);
    assert.equal((error as ApiError).kind, 'network');
    assert.doesNotMatch((error as ApiError).message, /pair-token-abc/, 'token never in the error');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('a 401 (bad/expired token) becomes an auth ApiError telling the user to re-scan', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response('unauthorized', { status: 401 })) as typeof fetch;

  try {
    await createLocalHermesVoiceSession({ gateway: GATEWAY, session: sessionRequest });
    assert.fail('should have thrown');
  } catch (error) {
    assert.ok(error instanceof ApiError);
    assert.equal((error as ApiError).kind, 'auth');
    assert.equal((error as ApiError).status, 401);
    assert.match((error as ApiError).message, /re-scan|pair/i);
    assert.doesNotMatch((error as ApiError).message, /pair-token-abc/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
