import test from 'node:test';
import assert from 'node:assert/strict';

import { toTechtreeResultCards, type TechtreeResultEntry } from '../utils/techtreeResults';

function entry(overrides: Partial<TechtreeResultEntry>): TechtreeResultEntry {
  return {
    skill_name: 'hello-world-v1',
    climb: 'hello-world-climb@1',
    campaign_name: 'Techtree Hello World',
    accepted_at: '2026-08-29T00:31:02.769939Z',
    entry_url: 'https://techtree.sh/results/sha256:abc',
    log_sequence: 4,
    withdrawn_at: null,
    result: {
      wins: 22,
      losses: 0,
      ties: 14,
      task_count: 36,
      candidate_mean: 0.6111,
      baseline_mean: 0,
      absolute_delta: 0.6111,
    },
    subject: { model: 'qwen/qwen3.7-flash', provider: 'prime', harness: 'hermes-agent' },
    ...overrides,
  };
}

test('withdrawn results are hidden and score change is signed to two decimals', () => {
  const cards = toTechtreeResultCards({
    entries: [
      entry({}),
      entry({ log_sequence: 3, withdrawn_at: '2026-08-30T00:00:00Z' }),
      entry({ log_sequence: 2, result: { ...entry({}).result, absolute_delta: -0.25 } }),
      entry({ log_sequence: 1, result: { ...entry({}).result, absolute_delta: 0 } }),
    ],
    next_before_sequence: null,
  });

  assert.deepEqual(
    cards.map((card) => card.id),
    ['4', '2', '1']
  );
  assert.equal(cards[0].scoreChange, '+0.61');
  assert.equal(cards[1].scoreChange, '-0.25');
  assert.equal(cards[2].scoreChange, '0.00');
  assert.equal(cards[0].record, '22 wins · 14 ties · 0 losses');
  assert.equal(cards[0].climbName, 'Techtree Hello World');
  assert.equal(cards[0].model, 'qwen/qwen3.7-flash');
});
