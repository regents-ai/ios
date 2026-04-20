let walletInitFailureMessage: string | null = null;

export function setWalletInitFailureMessage(message: string | null) {
  walletInitFailureMessage = message;
}

export function getWalletInitFailureMessage() {
  return walletInitFailureMessage;
}

export function clearWalletInitFailureMessage() {
  walletInitFailureMessage = null;
}
