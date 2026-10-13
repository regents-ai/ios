/**
 * Copies the SIWA signing contract and its fixtures from elixir-utils at the commit
 * siwa-contract.lock.json pins, and checks the copies against that commit.
 *
 * The files are read from the elixir-utils checkout beside this repository's main
 * checkout (`repos/elixir-utils` next to `repos/ios`). The copies are generated, never
 * edited by hand; `npm test` fails when one is not the file the lock names.
 *
 *   npm run siwa:contract           # write the copies and their sha256 into the lock
 *   npm run siwa:contract -- --check   # fail when a copy differs from the pinned commit
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type Lock = { repository: string; commit: string; files: Record<string, { copy: string; sha256: string }> };

const SERVER = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOCK = join(SERVER, 'siwa-contract.lock.json');

const git = (checkout: string, ...args: string[]) => execFileSync('git', ['-C', checkout, ...args]);
const sha256 = (content: Buffer) => createHash('sha256').update(content).digest('hex');

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== '--check')) {
  console.error(`unknown arguments: ${args.join(' ')}`);
  process.exit(2);
}
const check = args[0] === '--check';
const lock: Lock = JSON.parse(readFileSync(LOCK, 'utf8'));

// The folder holding every checkout: the parent of this repository's main checkout.
const common = git(SERVER, 'rev-parse', '--path-format=absolute', '--git-common-dir').toString().trim();
const checkout = join(dirname(dirname(common)), lock.repository.split('/')[1]!);

const drifted: string[] = [];
for (const [source, entry] of Object.entries(lock.files)) {
  const pinned = git(checkout, 'show', `${lock.commit}:${source}`);
  const target = join(SERVER, entry.copy);
  if (check) {
    let copy: Buffer | null = null;
    try {
      copy = readFileSync(target);
    } catch {}
    if (copy === null || !copy.equals(pinned) || entry.sha256 !== sha256(pinned)) {
      drifted.push(entry.copy);
    }
  } else {
    writeFileSync(target, pinned);
    entry.sha256 = sha256(pinned);
    console.log(`${source} -> ${entry.copy}`);
  }
}

if (drifted.length > 0) {
  console.error(`differs from its pin: ${drifted.join(', ')}. Run npm run siwa:contract`);
  process.exit(1);
}
if (check) {
  console.log(`the SIWA contract copies match ${lock.repository} at ${lock.commit}`);
} else {
  writeFileSync(LOCK, `${JSON.stringify(lock, null, 2)}\n`);
}
