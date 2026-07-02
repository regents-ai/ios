export const VERIFICATION_RESEND_SECONDS = 30;

export function nextVerificationResendSecond(current: number) {
  if (!Number.isFinite(current) || current <= 0) {
    return 0;
  }

  return Math.max(0, Math.floor(current) - 1);
}

export function isVerificationResendReady(seconds: number) {
  return nextVerificationResendSecond(seconds) === 0 && seconds <= 0;
}
