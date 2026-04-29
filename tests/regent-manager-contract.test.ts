import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));

test('mobile contract exposes Regent Manager through live Regent routes', () => {
  const contract = readFileSync(resolve(testDir, '../api-contract.openapiv3.yaml'), 'utf8');

  assert.match(contract, /\/mobile\/regents\/\{id\}\/manager/);
  assert.match(contract, /RegentManagerDetail/);
  assert.match(contract, /RegentPlatformState/);
});

test('active mobile app no longer names the old manager surface', () => {
  const files = [
    '../app/_layout.tsx',
    '../app/agent/[id].tsx',
    '../app/agent/[id]/regent-manager.tsx',
    '../utils/regentApi/client.ts',
    '../types/regents.ts',
  ];

  for (const file of files) {
    const contents = readFileSync(resolve(testDir, file), 'utf8');
    assert.match(contents, /Regent|regent/, file);
  }
});
