type PendingAgentFunding = {
  agentId: string;
  agentName: string;
  amount: string;
  currency: string;
  network: string;
  createdAt: string;
  transactionId?: string;
};

let currentPartnerUserRef: string | null = null;
let pendingTransactionForm: any = null;
let pendingOfframpBalance: any = null;
let pendingAgentFundings: PendingAgentFunding[] = [];
let terminalNoticeMarks = new Set<string>();
let phoneVerifyCanceled = false;

export function setPendingForm(form: any) {
  pendingTransactionForm = form;
}

export function getPendingForm() {
  return pendingTransactionForm;
}

export function clearPendingForm() {
  pendingTransactionForm = null;
}

export function setPendingOfframpBalance(balance: any) {
  pendingOfframpBalance = balance;
}

export function getPendingOfframpBalance() {
  return pendingOfframpBalance;
}

export function recordPendingAgentFunding(funding: PendingAgentFunding) {
  pendingAgentFundings = [
    funding,
    ...pendingAgentFundings.filter(
      (item) =>
        !(
          item.agentId === funding.agentId &&
          item.amount === funding.amount &&
          item.currency === funding.currency &&
          item.network === funding.network
        )
    ),
  ].slice(0, 8);
}

export function getPendingAgentFundings(agentId?: string) {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  pendingAgentFundings = pendingAgentFundings.filter((item) => new Date(item.createdAt).getTime() >= cutoff);

  if (!agentId) {
    return pendingAgentFundings;
  }

  return pendingAgentFundings.filter((item) => item.agentId === agentId);
}

export function clearPendingAgentFundings(agentId?: string) {
  if (!agentId) {
    pendingAgentFundings = [];
    return;
  }

  pendingAgentFundings = pendingAgentFundings.filter((item) => item.agentId !== agentId);
}

export function hasSeenTerminalNotice(noticeKey: string) {
  return terminalNoticeMarks.has(noticeKey);
}

export function markTerminalNoticeSeen(noticeKey: string) {
  terminalNoticeMarks.add(noticeKey);
}

export function clearTerminalNoticeMarks() {
  terminalNoticeMarks = new Set<string>();
}

export function setCurrentPartnerUserRef(reference: string | null) {
  currentPartnerUserRef = reference;
}

export function getCurrentPartnerUserRef() {
  return currentPartnerUserRef;
}

export function markPhoneVerifyCanceled() {
  phoneVerifyCanceled = true;
}

export function getPhoneVerifyWasCanceled() {
  return phoneVerifyCanceled;
}

export function clearPhoneVerifyWasCanceled() {
  phoneVerifyCanceled = false;
}
