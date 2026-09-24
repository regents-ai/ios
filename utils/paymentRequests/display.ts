import type { PaymentRequest, PaymentRequestStatus } from '@/types/regents';

const STATUS_LABELS: Record<PaymentRequestStatus, string> = {
  waiting: 'Waiting',
  paid: 'Paid',
  declined: 'Declined',
};

export function paymentRequestStatusLabel(status: PaymentRequestStatus) {
  return STATUS_LABELS[status];
}

export function waitingRequestCount(requests: readonly PaymentRequest[]) {
  return requests.filter((request) => request.status === 'waiting').length;
}

/**
 * What Pay means on a request that is already settled. Pay stays on screen
 * for every status, so a paid or declined request says so next to it.
 */
export function settledRequestNote(request: Pick<PaymentRequest, 'status' | 'amount'>) {
  switch (request.status) {
    case 'waiting':
      return null;
    case 'paid':
      return `This request is already paid. Paying again sends another ${request.amount} USDC.`;
    case 'declined':
      return 'You declined this request. You can still pay it.';
  }
}

/** True when the money goes to the agent's own wallet. */
export function paysAgentWallet(request: Pick<PaymentRequest, 'to' | 'agentWallet'>) {
  return request.to.toLowerCase() === request.agentWallet.toLowerCase();
}

/** The list with one request replaced by its newer copy; a request not in the list leaves it as it is. */
export function withUpdatedRequest(requests: readonly PaymentRequest[], updated: PaymentRequest): PaymentRequest[] {
  return requests.map((request) => (request.id === updated.id ? updated : request));
}
