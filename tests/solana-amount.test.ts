import test from 'node:test';
import assert from 'node:assert/strict';

import { parseSolanaAmountToBaseUnits } from '../utils/onchain/solanaAmount';

test('Solana amount builder handles SOL and SPL decimal precision exactly', () => {
  assert.equal(parseSolanaAmountToBaseUnits('1.000000001', 9), 1_000_000_001n);
  assert.equal(parseSolanaAmountToBaseUnits('0.000000001', 9), 1n);
  assert.equal(parseSolanaAmountToBaseUnits('25.123456', 6), 25_123_456n);
  assert.equal(parseSolanaAmountToBaseUnits('0.000001', 6), 1n);
});

test('Solana amount builder rejects tiny fractions that cannot be represented', () => {
  assert.throws(() => parseSolanaAmountToBaseUnits('0.0000000001', 9), /no more than 9 decimal places/);
  assert.throws(() => parseSolanaAmountToBaseUnits('0.0000001', 6), /no more than 6 decimal places/);
});

test('Solana amount builder rejects NaN and invalid decimals before conversion', () => {
  assert.throws(() => parseSolanaAmountToBaseUnits('1', NaN), /cannot be sent/);
  assert.throws(() => parseSolanaAmountToBaseUnits('1', 4.5), /cannot be sent/);
  assert.throws(() => parseSolanaAmountToBaseUnits('1', -1), /cannot be sent/);
  assert.throws(() => parseSolanaAmountToBaseUnits('1', 19), /cannot be sent/);
});

test('Solana amount builder rejects invalid and oversized sends', () => {
  assert.throws(() => parseSolanaAmountToBaseUnits('0', 9), /greater than zero/);
  assert.throws(() => parseSolanaAmountToBaseUnits('-1', 9), /valid amount/);
  assert.throws(() => parseSolanaAmountToBaseUnits('1e3', 9), /valid amount/);
  assert.throws(() => parseSolanaAmountToBaseUnits('18446744073.709551616', 9), /smaller amount/);
});
