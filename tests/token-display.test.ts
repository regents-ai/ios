import test from 'node:test';
import assert from 'node:assert/strict';

import { getTokenBalance, getUsdEstimate, parseTokenDecimals } from '../utils/onchain/tokenDisplay';

test('token decimals parse only as non-negative integers', () => {
  assert.equal(parseTokenDecimals(6), 6);
  assert.equal(parseTokenDecimals('6'), 6);
  assert.equal(parseTokenDecimals(0), 0);
  assert.equal(parseTokenDecimals('18'), 18);

  assert.equal(parseTokenDecimals(-1), null);
  assert.equal(parseTokenDecimals('-6'), null);
  assert.equal(parseTokenDecimals(6.5), null);
  assert.equal(parseTokenDecimals('6.5'), null);
  assert.equal(parseTokenDecimals(NaN), null);
  assert.equal(parseTokenDecimals('abc'), null);
  assert.equal(parseTokenDecimals(''), null);
  assert.equal(parseTokenDecimals(undefined), null);
  assert.equal(parseTokenDecimals(null), null);
});

test('token balance display surfaces invalid data instead of a silent zero', () => {
  assert.equal(getTokenBalance({ amount: { amount: '2500000', decimals: '6' } }), '2.5');
  assert.equal(getTokenBalance(null), '0');
  assert.equal(getTokenBalance({}), '0');

  assert.equal(getTokenBalance({ amount: { amount: '2500000', decimals: 'abc' } }), null);
  assert.equal(getTokenBalance({ amount: { amount: '2500000', decimals: '-6' } }), null);
  assert.equal(getTokenBalance({ amount: { amount: '2500000', decimals: '6.5' } }), null);
  assert.equal(getTokenBalance({ amount: { amount: 'abc', decimals: '6' } }), null);
});

test('USD estimate requires finite prices and valid decimals', () => {
  const token = { amount: { amount: '2000000', decimals: '6' }, usdValue: 2 };

  assert.equal(getUsdEstimate(token, '1'), '1.00');
  assert.equal(getUsdEstimate(token, ''), null);

  assert.equal(getUsdEstimate({ ...token, usdValue: Infinity }, '1'), null);
  assert.equal(getUsdEstimate({ ...token, usdValue: NaN }, '1'), null);
  assert.equal(getUsdEstimate({ amount: { amount: '2000000', decimals: 'abc' }, usdValue: 2 }, '1'), null);
  assert.equal(getUsdEstimate({ amount: { amount: 'abc', decimals: '6' }, usdValue: 2 }, '1'), null);
  assert.equal(getUsdEstimate(token, 'abc'), null);
});
