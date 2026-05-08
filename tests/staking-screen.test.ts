import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));

test('staking screen clears delayed refreshes when it is left', () => {
  const screen = readFileSync(resolve(testDir, '../app/staking.tsx'), 'utf8');

  assert.match(screen, /refreshTimerRef = useRef<ReturnType<typeof setTimeout> \| null>\(null\)/);
  assert.match(screen, /clearTimeout\(refreshTimerRef\.current\)/);
  assert.match(screen, /return clearScheduledRefresh/);
});
