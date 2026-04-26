import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));

test('wallet screen owns the page scroll instead of nesting the buy form scroll', () => {
  const walletScreen = readFileSync(resolve(testDir, '../app/(tabs)/wallet.tsx'), 'utf8');
  const onrampForm = readFileSync(resolve(testDir, '../components/onramp/OnrampForm.tsx'), 'utf8');

  assert.match(walletScreen, /<ScrollView/);
  assert.match(walletScreen, /scrollEnabled=\{!isSwipeActive\}/);
  assert.match(walletScreen, /onSwipeActiveChange=\{setIsSwipeActive\}/);
  assert.doesNotMatch(onrampForm, /<ScrollView/);
  assert.match(onrampForm, /onSwipeStart=\{handleSwipeStart\}/);
  assert.match(onrampForm, /onSwipeEnd=\{handleSwipeEnd\}/);
});
