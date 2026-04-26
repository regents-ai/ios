import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));

test('server route forwarders exist for auth and preview endpoints', () => {
  const files = [
    '../server/api/auth/me.js',
    '../server/api/auth/cdp-token.js',
    '../server/api/mobile-preview/[...slug].js',
  ];

  for (const file of files) {
    const fullPath = resolve(testDir, file);
    assert.equal(existsSync(fullPath), true, file);
  }
});

test('mobile preview forwarder preserves the preview route prefix', () => {
  const contents = readFileSync(resolve(testDir, '../server/api/mobile-preview/[...slug].js'), 'utf8');

  assert.match(contents, /\/mobile-preview\//);
});
