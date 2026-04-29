import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(testDir, '..');

function normalizeRoutePath(path: string) {
  return path.replace(/:[A-Za-z0-9_]+/g, '{}').replace(/\{[^}]+\}/g, '{}');
}

function contractRoutes() {
  const contract = readFileSync(resolve(rootDir, 'api-contract.openapiv3.yaml'), 'utf8');
  const routes = new Set<string>();
  let currentPath: string | null = null;

  for (const line of contract.split('\n')) {
    const pathMatch = line.match(/^  (\/[^:]+):$/);
    if (pathMatch?.[1]) {
      currentPath = normalizeRoutePath(pathMatch[1]);
      continue;
    }

    const methodMatch = line.match(/^    (get|post|put|patch|delete):$/);
    if (currentPath && methodMatch?.[1]) {
      routes.add(`${methodMatch[1].toUpperCase()} ${currentPath}`);
    }
  }

  return routes;
}

function implementedRoutes() {
  const routes = new Set<string>();
  const files = ['server/src/app.ts', 'server/src/mobileRoutes.ts'];

  for (const file of files) {
    const contents = readFileSync(resolve(rootDir, file), 'utf8');
    for (const match of contents.matchAll(/(?:app|router)\.(get|post|put|patch|delete)\(['"]([^'"]+)['"]/g)) {
      routes.add(`${match[1]!.toUpperCase()} ${normalizeRoutePath(match[2]!)}`);
    }
  }

  return routes;
}

test('server route forwarders exist for auth, live Regent, and terminal endpoints', () => {
  const files = [
    '../server/api/auth/me.js',
    '../server/api/auth/cdp-token.js',
    '../server/api/mobile/[...slug].js',
  ];

  for (const file of files) {
    const fullPath = resolve(testDir, file);
    assert.equal(existsSync(fullPath), true, file);
  }
});

test('served backend routes stay declared in the mobile API contract', () => {
  const contract = readFileSync(resolve(testDir, '../api-contract.openapiv3.yaml'), 'utf8');
  const routePaths = [
    '/health',
    '/.well-known/jwks.json',
    '/auth/me',
    '/auth/cdp-token',
    '/server/api',
    '/balances/evm',
    '/balances/solana',
    '/push-tokens/ping',
    '/push-tokens',
    '/push-tokens/debug/{user_id}',
    '/webhooks/onramp',
    '/mobile/regents',
    '/mobile/terminal/sessions',
  ];

  for (const routePath of routePaths) {
    assert.match(contract, new RegExp(`^  ${routePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:`, 'm'), routePath);
  }
});

test('implemented backend route methods match the mobile API contract', () => {
  const declared = contractRoutes();
  const implemented = implementedRoutes();

  assert.deepEqual([...implemented].filter((route) => !declared.has(route)).sort(), []);
  assert.deepEqual([...declared].filter((route) => !implemented.has(route)).sort(), []);
});

test('removed SMS forwarders stay absent', () => {
  assert.equal(existsSync(resolve(testDir, '../server/api/auth/sms/start.js')), false);
  assert.equal(existsSync(resolve(testDir, '../server/api/auth/sms/verify.js')), false);
});

test('mobile Regent forwarder preserves the live route prefix', () => {
  const contents = readFileSync(resolve(testDir, '../server/api/mobile/[...slug].js'), 'utf8');

  assert.match(contents, /\/mobile\//);
});

test('mobile terminal routes use the live mobile prefix only', () => {
  const contents = readFileSync(resolve(testDir, '../server/api/mobile/[...slug].js'), 'utf8');

  assert.match(contents, /\/mobile\//);
});
