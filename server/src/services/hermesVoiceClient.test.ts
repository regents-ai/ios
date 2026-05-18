import assert from 'node:assert/strict';
import test from 'node:test';

import { createHermesVoiceClient } from './hermesVoiceClient.js';

test('Hermes voice requires its gateway token in every documented release mode', async () => {
  const previousToken = process.env.HERMES_VOICE_GATEWAY_TOKEN;
  const previousNodeEnv = process.env.NODE_ENV;
  const previousVercelEnv = process.env.VERCEL_ENV;
  const previousRelease = process.env.REGENTS_RELEASE;

  try {
    delete process.env.HERMES_VOICE_GATEWAY_TOKEN;
    delete process.env.NODE_ENV;
    delete process.env.VERCEL_ENV;
    delete process.env.REGENTS_RELEASE;

    const client = createHermesVoiceClient(async () => {
      throw new Error('fetch should not run without release voice config');
    });

    process.env.NODE_ENV = 'production';
    assert.deepEqual(
      await client.status({ statusUrl: 'https://voice.example/status' }),
      { kind: 'missing_config', requiredEnv: 'HERMES_VOICE_GATEWAY_TOKEN' },
    );

    process.env.NODE_ENV = 'development';
    process.env.VERCEL_ENV = 'production';
    assert.deepEqual(
      await client.status({ statusUrl: 'https://voice.example/status' }),
      { kind: 'missing_config', requiredEnv: 'HERMES_VOICE_GATEWAY_TOKEN' },
    );

    process.env.VERCEL_ENV = 'preview';
    process.env.REGENTS_RELEASE = 'true';
    assert.deepEqual(
      await client.status({ statusUrl: 'https://voice.example/status' }),
      { kind: 'missing_config', requiredEnv: 'HERMES_VOICE_GATEWAY_TOKEN' },
    );
  } finally {
    if (previousToken === undefined) {
      delete process.env.HERMES_VOICE_GATEWAY_TOKEN;
    } else {
      process.env.HERMES_VOICE_GATEWAY_TOKEN = previousToken;
    }
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
    if (previousVercelEnv === undefined) {
      delete process.env.VERCEL_ENV;
    } else {
      process.env.VERCEL_ENV = previousVercelEnv;
    }
    if (previousRelease === undefined) {
      delete process.env.REGENTS_RELEASE;
    } else {
      process.env.REGENTS_RELEASE = previousRelease;
    }
  }
});
