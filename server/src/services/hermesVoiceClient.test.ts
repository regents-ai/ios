import assert from 'node:assert/strict';
import test from 'node:test';

import { createHermesVoiceClient, isAllowedHermesGatewayUrl } from './hermesVoiceClient.js';

function clearEnv(name: string) {
  Reflect.deleteProperty(process.env, name);
}

function setEnv(name: string, value: string) {
  Reflect.set(process.env, name, value);
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    clearEnv(name);
  } else {
    setEnv(name, value);
  }
}

test('Hermes voice requires its gateway token in every documented release mode', async () => {
  const previousToken = process.env.HERMES_VOICE_GATEWAY_TOKEN;
  const previousNodeEnv = process.env.NODE_ENV;
  const previousVercelEnv = process.env.VERCEL_ENV;
  const previousRelease = process.env.REGENTS_RELEASE;

  try {
    clearEnv('HERMES_VOICE_GATEWAY_TOKEN');
    clearEnv('NODE_ENV');
    clearEnv('VERCEL_ENV');
    clearEnv('REGENTS_RELEASE');

    const client = createHermesVoiceClient(async () => {
      throw new Error('fetch should not run without release voice config');
    });

    setEnv('NODE_ENV', 'production');
    assert.deepEqual(
      await client.status({ statusUrl: 'https://voice.example/status' }),
      { kind: 'missing_config', requiredEnv: 'HERMES_VOICE_GATEWAY_TOKEN' },
    );

    setEnv('NODE_ENV', 'development');
    setEnv('VERCEL_ENV', 'production');
    assert.deepEqual(
      await client.status({ statusUrl: 'https://voice.example/status' }),
      { kind: 'missing_config', requiredEnv: 'HERMES_VOICE_GATEWAY_TOKEN' },
    );

    setEnv('VERCEL_ENV', 'preview');
    setEnv('REGENTS_RELEASE', 'true');
    assert.deepEqual(
      await client.status({ statusUrl: 'https://voice.example/status' }),
      { kind: 'missing_config', requiredEnv: 'HERMES_VOICE_GATEWAY_TOKEN' },
    );
  } finally {
    restoreEnv('HERMES_VOICE_GATEWAY_TOKEN', previousToken);
    restoreEnv('NODE_ENV', previousNodeEnv);
    restoreEnv('VERCEL_ENV', previousVercelEnv);
    restoreEnv('REGENTS_RELEASE', previousRelease);
  }
});

test('the gateway token is only sent to pinned voice gateway hosts', async () => {
  const previousAllowed = process.env.HERMES_VOICE_ALLOWED_HOSTS;

  try {
    clearEnv('HERMES_VOICE_ALLOWED_HOSTS');

    // Pinned by default: HTTPS agent workspaces.
    assert.equal(isAllowedHermesGatewayUrl('https://my-agent.sprites.dev/hermes/voice/session'), true);

    // Everything else is refused: foreign hosts, plain HTTP, garbage URLs.
    assert.equal(isAllowedHermesGatewayUrl('https://evil.example/hermes/voice/session'), false);
    assert.equal(isAllowedHermesGatewayUrl('http://my-agent.sprites.dev/hermes/voice/session'), false);
    assert.equal(isAllowedHermesGatewayUrl('https://sprites.dev.evil.example/session'), false);
    assert.equal(isAllowedHermesGatewayUrl('not a url'), false);

    // Operator-approved exact hostnames extend the pin (local dev gateways).
    setEnv('HERMES_VOICE_ALLOWED_HOSTS', 'localhost, voice-gw.internal');
    assert.equal(isAllowedHermesGatewayUrl('http://localhost:4000/hermes/voice/session'), true);
    assert.equal(isAllowedHermesGatewayUrl('https://voice-gw.internal/hermes/voice/session'), true);
    assert.equal(isAllowedHermesGatewayUrl('https://evil.example/hermes/voice/session'), false);
  } finally {
    restoreEnv('HERMES_VOICE_ALLOWED_HOSTS', previousAllowed);
  }
});

test('voice requests to an unpinned host are refused before any network call', async () => {
  const previousAllowed = process.env.HERMES_VOICE_ALLOWED_HOSTS;
  const previousToken = process.env.HERMES_VOICE_GATEWAY_TOKEN;

  try {
    clearEnv('HERMES_VOICE_ALLOWED_HOSTS');
    setEnv('HERMES_VOICE_GATEWAY_TOKEN', 'test-token');

    let fetchCalls = 0;
    const client = createHermesVoiceClient(async () => {
      fetchCalls += 1;
      throw new Error('fetch must not run for an unpinned host');
    });

    assert.deepEqual(
      await client.status({ statusUrl: 'https://evil.example/hermes/voice/status' }),
      { kind: 'upstream_error', message: 'Hermes voice is unavailable.' },
    );
    assert.deepEqual(
      await client.createSession({
        sessionUrl: 'https://evil.example/hermes/voice/session',
        safetyIdentifier: 'safety-id',
        body: {},
      }),
      { kind: 'upstream_error', message: 'Hermes voice is unavailable.' },
    );
    assert.equal(fetchCalls, 0);
  } finally {
    restoreEnv('HERMES_VOICE_ALLOWED_HOSTS', previousAllowed);
    restoreEnv('HERMES_VOICE_GATEWAY_TOKEN', previousToken);
  }
});

test('voice requests to a pinned host still reach the gateway', async () => {
  const previousAllowed = process.env.HERMES_VOICE_ALLOWED_HOSTS;
  const previousToken = process.env.HERMES_VOICE_GATEWAY_TOKEN;

  try {
    clearEnv('HERMES_VOICE_ALLOWED_HOSTS');
    setEnv('HERMES_VOICE_GATEWAY_TOKEN', 'test-token');

    const requestedUrls: string[] = [];
    const client = createHermesVoiceClient(async (url) => {
      requestedUrls.push(String(url));
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const result = await client.prewarm({
      sessionUrl: 'https://my-agent.sprites.dev/hermes/voice/session',
      safetyIdentifier: 'safety-id',
    });

    assert.deepEqual(result, { kind: 'ok', data: { ok: true } });
    assert.deepEqual(requestedUrls, ['https://my-agent.sprites.dev/hermes/voice/prewarm']);
  } finally {
    restoreEnv('HERMES_VOICE_ALLOWED_HOSTS', previousAllowed);
    restoreEnv('HERMES_VOICE_GATEWAY_TOKEN', previousToken);
  }
});
