import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const srcDir = dirname(fileURLToPath(import.meta.url));
const serverDir = resolve(srcDir, '..');

function jsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      return jsFiles(fullPath);
    }

    return extname(entry.name) === '.js' ? [fullPath] : [];
  });
}

test('serverless forwarders import from a clean server build', async () => {
  const build = spawnSync('npm', ['run', 'build'], {
    cwd: serverDir,
    encoding: 'utf8',
  });

  assert.equal(build.status, 0, `${build.stdout}\n${build.stderr}`);

  const forwarders = jsFiles(resolve(serverDir, 'api')).sort();
  assert.ok(forwarders.length > 0);

  for (const file of forwarders) {
    const moduleUrl = `${pathToFileURL(file).href}?test=${Date.now()}`;
    const imported = await import(moduleUrl);
    assert.equal(typeof imported.default, 'function', file);
  }
});
