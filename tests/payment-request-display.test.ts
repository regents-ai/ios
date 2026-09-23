import test from 'node:test';
import assert from 'node:assert/strict';

import type { PaymentRequest } from '../types/regents';
import {
  paymentRequestStatusLabel,
  paysAgentWallet,
  waitingRequestCount,
  withUpdatedRequest,
} from '../utils/paymentRequests/display';

const agentWallet = '0x9fa152B0EAdbFe9A7c5C0a8e1D11784f22669a3e';

function request(overrides: Partial<PaymentRequest> = {}): PaymentRequest {
  return {
    id: 'req-1',
    agentId: 'agent-1',
    agentName: 'Muse',
    agentWallet,
    to: agentWallet,
    amount: '5.00',
    amountRaw: '5000000',
    note: 'API credits for tonight',
    createdAt: '2026-09-23T12:00:00.000Z',
    status: 'waiting',
    txHash: null,
    ...overrides,
  };
}

test('the tab badge counts only waiting requests', () => {
  assert.equal(
    waitingRequestCount([
      request({ id: 'a' }),
      request({ id: 'b', status: 'paid' }),
      request({ id: 'c', status: 'declined' }),
      request({ id: 'd' }),
    ]),
    2,
  );
  assert.equal(waitingRequestCount([]), 0);
});

test('money to the agent wallet reads as your agent, in any letter case', () => {
  assert.equal(paysAgentWallet(request()), true);
  assert.equal(paysAgentWallet(request({ to: agentWallet.toLowerCase() })), true);
  assert.equal(paysAgentWallet(request({ to: '0x1111111111111111111111111111111111111111' })), false);
});

test('a paid or declined request replaces its copy in the list', () => {
  const list = [request({ id: 'a' }), request({ id: 'b' })];
  const updated = withUpdatedRequest(list, request({ id: 'b', status: 'paid', txHash: `0x${'ab'.repeat(32)}` }));

  assert.deepEqual(updated.map((item) => item.status), ['waiting', 'paid']);
  assert.deepEqual(withUpdatedRequest(list, request({ id: 'z', status: 'declined' })), list);
  assert.equal(paymentRequestStatusLabel('declined'), 'Declined');
});
