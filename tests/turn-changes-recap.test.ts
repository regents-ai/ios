import test from 'node:test';
import assert from 'node:assert/strict';

import type { MessageThreadEvent } from '../types/regents';
import { summarizeTurnChanges, turnChangesSummary } from '../utils/turnChangesRecap';

function event(partial: Partial<MessageThreadEvent>): MessageThreadEvent {
  return {
    eventId: Math.random().toString(36).slice(2),
    type: 'message',
    threadId: 't',
    ts: '2026-07-01T00:00:00Z',
    ...partial,
  };
}

test('summarizes only approved money-moving changes from the latest turn', () => {
  const events: MessageThreadEvent[] = [
    event({ role: 'user', type: 'message', text: 'earlier turn' }),
    event({ type: 'tool.resolved', action: 'transfer', result: 'approved', amount: '5', currency: 'USDC' }),
    event({ role: 'user', type: 'message', text: 'do a swap and a transfer' }),
    event({ type: 'tool.resolved', action: 'swap', result: 'approved', amount: '10', currency: 'USDC', amountUsd: '10' }),
    event({ type: 'tool.resolved', action: 'send_transfer', result: 'denied', amount: '3', currency: 'USDC' }),
    event({ type: 'tool.resolved', action: 'stake', result: 'approved' }),
    event({ role: 'assistant', type: 'message', text: 'done' }),
  ];

  const rows = summarizeTurnChanges(events);
  assert.equal(rows.length, 2, 'only this turn, only approved');
  assert.equal(rows[0].action, 'Swap');
  assert.equal(rows[0].amountLabel, '10 USDC · $10');
  assert.equal(rows[1].action, 'Stake');
  assert.equal(rows[1].amountLabel, null, 'no money line when no amount');
});

test('denied and timed-out actions never appear as changes', () => {
  const events: MessageThreadEvent[] = [
    event({ role: 'user' }),
    event({ type: 'tool.resolved', action: 'transfer', result: 'denied', amount: '1', currency: 'USDC' }),
    event({ type: 'tool.resolved', action: 'transfer', result: 'timed_out', amount: '1', currency: 'USDC' }),
  ];
  assert.equal(summarizeTurnChanges(events).length, 0);
});

test('summary line pluralizes and hides when empty', () => {
  assert.equal(turnChangesSummary([]), null);
  const one = summarizeTurnChanges([
    event({ role: 'user' }),
    event({ type: 'tool.resolved', action: 'swap', result: 'approved' }),
  ]);
  assert.equal(turnChangesSummary(one), '1 change this turn');
});

test('a turn with no tool activity produces no recap', () => {
  const events: MessageThreadEvent[] = [
    event({ role: 'user', text: 'hi' }),
    event({ role: 'assistant', text: 'hello' }),
  ];
  assert.equal(turnChangesSummary(summarizeTurnChanges(events)), null);
});
