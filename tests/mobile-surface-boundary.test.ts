import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Techtree mobile tab links to the owning operator surface without shipping command help', () => {
  const techtree = readFileSync('app/(tabs)/techtree.tsx', 'utf8');
  const hub = readFileSync('components/learn/InformationalHubScreen.tsx', 'utf8');

  assert.match(techtree, /https:\/\/github\.com\/regents-ai\/regents-cli/);
  assert.doesNotMatch(techtree, /pnpm add|regent techtree start/);
  assert.doesNotMatch(hub, /Clipboard|Copy install command|Copy start command/);
});
