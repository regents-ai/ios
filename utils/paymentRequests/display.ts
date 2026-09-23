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

/** True when the money goes to the agent's own wallet. */
export function paysAgentWallet(request: Pick<PaymentRequest, 'to' | 'agentWallet'>) {
  return request.to.toLowerCase() === request.agentWallet.toLowerCase();
}

/** The list with one request replaced by its newer copy; a request not in the list leaves it as it is. */
export function withUpdatedRequest(requests: readonly PaymentRequest[], updated: PaymentRequest): PaymentRequest[] {
  return requests.map((request) => (request.id === updated.id ? updated : request));
}
