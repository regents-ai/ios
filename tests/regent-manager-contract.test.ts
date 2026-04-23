import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const oldSurfacePattern = new RegExp(['Paper' + 'clip', 'paper' + 'clip', 'Preview' + 'Paper' + 'clip'].join('|'));
const testDir = dirname(fileURLToPath(import.meta.url));

test('mobile contract exposes Regent Manager preview route only', () => {
  const contract = readFileSync(resolve(testDir, '../api-contract.openapiv3.yaml'), 'utf8');

  assert.match(contract, /\/mobile-preview\/agents\/\{id\}\/regent-manager/);
  assert.match(contract, /PreviewRegentManagerDetail/);
  assert.doesNotMatch(contract, oldSurfacePattern);
});

test('active mobile app no longer names the old manager surface', () => {
  const files = [
    '../app/_layout.tsx',
    '../app/agent/[id].tsx',
    '../app/agent/[id]/regent-manager.tsx',
    '../utils/fetchPreviewRegentManager.ts',
    '../types/agentPreviews.ts',
  ];

  for (const file of files) {
    const contents = readFileSync(resolve(testDir, file), 'utf8');
    assert.doesNotMatch(contents, oldSurfacePattern, file);
  }
});
