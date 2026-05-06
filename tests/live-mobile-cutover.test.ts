import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));

test('mobile Regent contract exposes the current route family', () => {
  const contract = readFileSync(resolve(testDir, '../api-contract.openapiv3.yaml'), 'utf8');

  assert.match(contract, /\/mobile\/regents/);
  assert.match(contract, /\/mobile\/terminal\/sessions/);
  assert.match(contract, /RegentReturnRequest/);
});

test('mobile app and backend do not use the old preview route family', () => {
  const result = spawnSync('rg', ['-n', '/mobile-preview|mobile-preview', 'app', 'utils', 'types', 'server/src', 'server/api', 'api-contract.openapiv3.yaml'], {
    cwd: resolve(testDir, '..'),
    encoding: 'utf8',
  });

  assert.equal(result.status, 1, result.stdout);
  assert.equal(result.stdout, '');
});

test('mobile Talk surfaces are visible without opening Hermes sessions', () => {
  const appFiles = [
    '../app/(tabs)/agents.tsx',
    '../app/(tabs)/terminal.tsx',
    '../app/agent/[id].tsx',
    '../app/terminal/[id].tsx',
  ];
  const helperFiles = [
    '../utils/regentApi/client.ts',
    '../utils/navigation/routes.ts',
  ];
  const talkMethodPattern =
    /regentApi\.(listTerminalSessions|createTerminalSession|getTerminalSession|getTerminalEvents|sendTerminalMessage|resolveTerminalApproval)|routes\.terminalSession\(|router\.push\(['"]\/terminal['"]\)/;

  assert.match(readFileSync(resolve(testDir, '../app/(tabs)/terminal.tsx'), 'utf8'), /TalkComingSoon/);
  assert.match(readFileSync(resolve(testDir, '../app/terminal/[id].tsx'), 'utf8'), /TalkComingSoon/);
  assert.match(readFileSync(resolve(testDir, '../app/(tabs)/agents.tsx'), 'utf8'), /Hermes Talk is coming soon/);
  assert.match(readFileSync(resolve(testDir, '../app/agent/[id].tsx'), 'utf8'), /Talk coming soon/);

  for (const file of [...appFiles, ...helperFiles]) {
    const contents = readFileSync(resolve(testDir, file), 'utf8');
    assert.doesNotMatch(contents, talkMethodPattern, file);
  }
});
