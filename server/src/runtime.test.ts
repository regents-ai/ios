import assert from 'node:assert/strict';
import test from 'node:test';

import { isReleaseRuntime } from './runtime.js';

test('release runtime is controlled by documented release flags', () => {
  assert.equal(isReleaseRuntime({ NODE_ENV: 'production' }), true);
  assert.equal(isReleaseRuntime({ VERCEL_ENV: 'production' }), true);
  assert.equal(isReleaseRuntime({ REGENTS_RELEASE: 'true' }), true);
  assert.equal(isReleaseRuntime({ NODE_ENV: 'development', VERCEL_ENV: 'preview', REGENTS_RELEASE: 'false' }), false);
});
