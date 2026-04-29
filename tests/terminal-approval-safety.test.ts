import test from 'node:test';
import assert from 'node:assert/strict';

import { buildTerminalApprovalSafetyRows } from '../utils/terminalApprovalSafety';

test('terminal approval safety explains money reviews without inventing custody', () => {
  const rows = buildTerminalApprovalSafetyRows({
    agentName: 'Atlas Capital',
    approval: {
      requestId: 'approval-1',
      action: 'Approve treasury transfer',
      regentName: 'Atlas Capital',
      riskCopy: 'Atlas Capital wants approval to move 500 USDC into a launch budget.',
      amount: '500',
      currency: 'USDC',
      expiresAt: '2026-12-31T00:00:00.000Z',
      resolved: false,
    },
  });

  assert.deepEqual(
    rows.map((row) => row.label),
    ['Decision', 'Requesting Regent', 'Money path', 'Risk', 'Expires', 'Final check']
  );
  assert.match(rows[0].value, /You decide/);
  assert.equal(rows[1].value, 'Atlas Capital');
  assert.match(rows[2].value, /500 USDC/);
  assert.match(rows[5].value, /Wallet and Base records/);
});

test('terminal approval safety handles non-money reviews separately', () => {
  const rows = buildTerminalApprovalSafetyRows({
    agentName: 'Meridian Ops',
    approval: {
      requestId: 'approval-2',
      action: 'Approve note',
      regentName: 'Meridian Ops',
      riskCopy: 'Meridian Ops wants approval to publish the latest update.',
      expiresAt: '2026-12-31T00:00:00.000Z',
      resolved: false,
    },
  });

  assert.equal(rows[2].label, 'Requested action');
  assert.equal(rows[2].value, 'Approve note');
  assert.match(rows[5].value, /talk history/);
});
