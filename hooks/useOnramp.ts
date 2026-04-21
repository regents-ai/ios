import { useRegentsAuth } from '@/hooks/useRegentsAuth';
import { useOnrampCheckout } from '@/hooks/onramp/useOnrampCheckout';
import { useOnrampOptions } from '@/hooks/onramp/useOnrampOptions';
import { useOnrampQuote } from '@/hooks/onramp/useOnrampQuote';

export type PaymentMethodOption = { display: string; value: string };

export function useOnramp() {
  const { linkedEmail, linkedPhone, regentsUserId } = useRegentsAuth();
  const optionsState = useOnrampOptions();
  const quoteState = useOnrampQuote({
    getAssetSymbolFromName: optionsState.getAssetSymbolFromName,
    getNetworkNameFromDisplayName: optionsState.getNetworkNameFromDisplayName,
    regentsUserId,
  });
  const checkoutState = useOnrampCheckout({
    getAssetSymbolFromName: optionsState.getAssetSymbolFromName,
    getNetworkNameFromDisplayName: optionsState.getNetworkNameFromDisplayName,
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
