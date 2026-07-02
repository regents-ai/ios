import test from 'node:test';
import assert from 'node:assert/strict';

import { createLatestRequestGate } from '../utils/async/latestRequestGate';

test('latest request gate marks older requests stale when a newer request starts', () => {
  const gate = createLatestRequestGate();

  const first = gate.next();
  assert.equal(gate.isLatest(first), true);

  const second = gate.next();
  assert.equal(gate.isLatest(first), false);
  assert.equal(gate.isLatest(second), true);
});

test('latest request gates are independent', () => {
  const quoteGate = createLatestRequestGate();
  const balanceGate = createLatestRequestGate();

  const quoteRequest = quoteGate.next();
  const balanceRequest = balanceGate.next();
  quoteGate.next();

  assert.equal(quoteGate.isLatest(quoteRequest), false);
  assert.equal(balanceGate.isLatest(balanceRequest), true);
});
