import assert from 'node:assert/strict';
import test from 'node:test';

import { createHermesVoiceClient } from './hermesVoiceClient.js';

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
