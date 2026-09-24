import { useRegentsAuth } from '@/hooks/useRegentsAuth';
import { useOnrampCheckout } from '@/hooks/onramp/useOnrampCheckout';
import { useOnrampOptions } from '@/hooks/onramp/useOnrampOptions';
import { useOnrampQuote } from '@/hooks/onramp/useOnrampQuote';

export type PaymentMethodOption = { display: string; value: string };

export function useOnramp() {
  const { linkedEmail, linkedPhone, regentsUserId } = useRegentsAuth();
  const optionsState = useOnrampOptions();
  const quoteState = useOnrampQuote({ regentsUserId });
  const checkoutState = useOnrampCheckout({
    linkedEmail,
    linkedPhone,
    regentsUserId,
  });

  return {
    ...checkoutState,
    ...optionsState,
    ...quoteState,
  };
}
