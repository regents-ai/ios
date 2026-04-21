let currentPartnerUserRef: string | null = null;
let pendingTransactionForm: any = null;
let pendingOfframpBalance: any = null;
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
