import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { isReleaseRuntime } from './runtime.js';

type StateFactory<T> = () => T;

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createJsonFileStore<T extends object>(fileName: string, createInitialState: StateFactory<T>) {
  const configuredDirectory = process.env.REGENTS_MOBILE_STATE_DIR?.trim();
  if (isReleaseRuntime() && !configuredDirectory) {
    throw new Error('REGENTS_MOBILE_STATE_DIR is required for release wallet intent storage.');
  }

  const directory = configuredDirectory || join(process.cwd(), '.regents-mobile-state');
  const filePath = join(directory, fileName);

  function ensureFile() {
    if (existsSync(filePath)) {
      return;
    }

    mkdirSync(directory, { recursive: true });
    writeFileSync(filePath, JSON.stringify(createInitialState(), null, 2));
  }

  function read(): T {
    ensureFile();
    return JSON.parse(readFileSync(filePath, 'utf8')) as T;
  }

  function write(nextState: T): T {
    mkdirSync(directory, { recursive: true });
    const tempPath = `${filePath}.${process.pid}.tmp`;
    writeFileSync(tempPath, JSON.stringify(nextState, null, 2));
    renameSync(tempPath, filePath);
    return cloneJson(nextState);
  }

  function update(mutator: (state: T) => void): T {
    const state = read();
    mutator(state);
    return write(state);
  }

  function reset(nextState = createInitialState()): T {
    return write(nextState);
  }

  return {
    read,
    write,
    update,
    reset,
    filePath,
  };
}
