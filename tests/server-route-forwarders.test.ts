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
    '../server/api/.well-known/jwks.json.js',
    '../server/api/mobile/[...slug].js',
    '../server/api/push-tokens/debug/[user_id].js',
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

test('Coinbase proxy contract exposes the operation allowlist only', () => {
  const contract = readFileSync(resolve(testDir, '../api-contract.openapiv3.yaml'), 'utf8');
  const schema = contract.slice(
    contract.indexOf('CoinbaseProxyRequest:'),
    contract.indexOf('CoinbaseOnrampWebhook:')
  );

  assert.match(schema, /required: \[operation\]/);
  assert.match(schema, /- buy_config[\s\S]*- offramp_token/);
  assert.match(schema, /additionalProperties: false/);
  assert.doesNotMatch(schema, /required: \[url\]/);
  assert.doesNotMatch(schema, /format: uri/);
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

test('serverless route forwarders load the built server app', () => {
  const files = [
    '../server/api/health.js',
    '../server/api/push-tokens.js',
    '../server/api/push-tokens/ping.js',
    '../server/api/auth/me.js',
    '../server/api/auth/cdp-token.js',
    '../server/api/.well-known/jwks.json.js',
    '../server/api/server/api.js',
    '../server/api/mobile/[...slug].js',
    '../server/api/push-tokens/debug/[user_id].js',
    '../server/api/balances/evm.js',
    '../server/api/balances/solana.js',
    '../server/api/webhooks/onramp.js',
  ];

  for (const file of files) {
    const contents = readFileSync(resolve(testDir, file), 'utf8');
    assert.match(contents, /dist\/app\.js/, file);
    assert.doesNotMatch(contents, /src\/app\.js/, file);
  }
});

test('root package scripts do not point at ignored local scripts', () => {
  const pkg = JSON.parse(readFileSync(resolve(testDir, '../package.json'), 'utf8'));

  assert.equal(pkg.scripts['reset-project'], undefined);
  for (const script of Object.values(pkg.scripts) as string[]) {
    assert.doesNotMatch(script, /node \.\/scripts\//);
  }
});
