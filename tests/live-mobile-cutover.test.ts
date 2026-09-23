import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));

test('mobile contract exposes the current route family', () => {
  const contract = readFileSync(resolve(testDir, '../api-contract.openapiv3.yaml'), 'utf8');

  assert.match(contract, /\/mobile\/agents/);
  assert.match(contract, /\/agent\/pair/);
  assert.match(contract, /\/mobile\/regent\/staking/);
  assert.match(contract, /\/mobile\/portal-pairing/);
});

test('mobile navigation uses typed route helpers instead of route casts', () => {
  const onrampSubmit = readFileSync(resolve(testDir, '../hooks/onramp/use-wallet-onramp-submit.ts'), 'utf8');
  const navigationRoutes = readFileSync(resolve(testDir, '../utils/navigation/routes.ts'), 'utf8');
  const result = spawnSync('rg', [
    '-n',
    'router\\.(push|replace)\\([^\\n]*as any|navigationPath\\?: string|as unknown as Href',
    'app',
    'hooks',
    'utils/navigation',
    'components',
  ], {
    cwd: resolve(testDir, '..'),
    encoding: 'utf8',
  });

  assert.match(navigationRoutes, /emailVerify\(params: \{ mode: EmailVerifyMode; initialEmail\?: string \}\)/);
  assert.match(navigationRoutes, /phoneVerify\(params: \{/);
  assert.match(onrampSubmit, /navigationPath: routes\.emailVerify\(\{ mode: 'link' \}\)/);
  assert.match(onrampSubmit, /navigationPath: routes\.phoneVerify\(\{ mode: 'link' \}\)/);
  assert.match(onrampSubmit, /router\.push\(navigationPath\)/);
  assert.equal(result.status, 1, result.stdout);
  assert.equal(result.stdout, '');
});
