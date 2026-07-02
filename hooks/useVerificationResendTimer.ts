import { useCallback, useEffect, useState } from 'react';

import {
  nextVerificationResendSecond,
  VERIFICATION_RESEND_SECONDS,
} from '@/utils/verificationResendTimer';

export function useVerificationResendTimer(initialSeconds = VERIFICATION_RESEND_SECONDS) {
  const [resendSeconds, setResendSeconds] = useState(initialSeconds);

  useEffect(() => {
    if (resendSeconds <= 0) {
      return;
    }

    const timer = setInterval(() => {
      setResendSeconds(nextVerificationResendSecond);
    }, 1000);

    return () => clearInterval(timer);
  }, [resendSeconds]);

  const resetResendTimer = useCallback(() => {
    setResendSeconds(initialSeconds);
  }, [initialSeconds]);

  return {
    canResend: resendSeconds <= 0,
    resendSeconds,
    resetResendTimer,
  };
}
