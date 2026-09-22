import { useEffect, useRef } from "react";
import { WebView } from "react-native-webview";

/**
 * Shared Guest Checkout WebView Widget for Apple Pay (iOS) and Google Pay (Android).
 *
 * Orchestrates the payment flow via a behind-the-scenes WebView:
 *
 * 1. Loads the Coinbase hosted payment page (paymentLink URL from Create Order API)
 * 2. On load_success (page event), auto-clicks the native pay button
 * 3. The native payment sheet appears and the user confirms there.
 *      Transaction completes automatically without real funds.
 *
 * 4. All transaction lifecycle events are dispatched by the payment page itself
 *    via postMessage. We only consume and log them.
 */

const PAYMENT_CONFIG = {
  GUEST_CHECKOUT_APPLE_PAY: {
    buttonId: 'api-onramp-apple-pay-button',
    hideCSS: 'apple-pay-button { display: none !important; }',
    label: 'Apple Pay',
  },
  GUEST_CHECKOUT_GOOGLE_PAY: {
    buttonId: 'gpay-button-online-api-id',
    hideCSS: '#api-onramp-google-pay-button { visibility: hidden !important; height: 0 !important; overflow: hidden !important; }',
    label: 'Google Pay',
  },
} as const;

type GuestCheckoutMethod = keyof typeof PAYMENT_CONFIG;

export function APIGuestCheckoutWidget({
  paymentUrl,
  paymentMethod,
  onClose,
  setIsProcessingPayment,
  setTransactionStatus,
  onAlert,
}: {
  paymentUrl: string;
  paymentMethod: GuestCheckoutMethod;
  onClose?: () => void;
  setIsProcessingPayment?: (loading: boolean) => void;
  setTransactionStatus?: (status: 'pending' | 'success' | 'error' | null) => void;
  onAlert?: (title: string, message: string, type: 'success' | 'error' | 'info') => void;
}) {
  const webViewRef = useRef<WebView>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const config = PAYMENT_CONFIG[paymentMethod] ?? PAYMENT_CONFIG.GUEST_CHECKOUT_APPLE_PAY;
  const finalUrl = paymentUrl;

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  if (!paymentUrl) return null;

  const hiddenStyle = {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: -1,
    opacity: 0,
  };

  const injectPayButtonClick = () => {
    console.log(`[${config.label}] Injecting pay button click (button: ${config.buttonId})`);
    webViewRef.current?.injectJavaScript(`
      (function() {
        var style = document.createElement('style');
        style.textContent = \`${config.hideCSS}\`;
        document.head.appendChild(style);

        function tryClick(attempt) {
          var btn = document.getElementById('${config.buttonId}');
          if (btn) {
            btn.click();
          } else if (attempt < 10) {
            setTimeout(function() { tryClick(attempt + 1); }, 500);
          }
        }
        tryClick(1);
      })();
      true;
    `);
  };

  console.log(`[${config.label}] Loading URL: ${finalUrl}`);

  const webView = (
    <WebView
      ref={webViewRef}
      style={hiddenStyle}
      onLoadStart={() => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        console.log(`[${config.label}] WebView loading, starting 60s timeout...`);
        timeoutRef.current = setTimeout(() => {
          console.log(`[${config.label}] Timeout — resetting state`);
          onAlert?.("Payment Timeout", "The payment process took too long. Please try again.", 'error');
          setIsProcessingPayment?.(false);
          onClose?.();
        }, 60000);
      }}
      onError={(syntheticEvent) => {
        const { nativeEvent } = syntheticEvent;
        console.error(`[${config.label}] WebView error:`, nativeEvent.description);
      }}
      onHttpError={(syntheticEvent) => {
        const { nativeEvent } = syntheticEvent;
        console.error(`[${config.label}] HTTP error:`, nativeEvent.statusCode, nativeEvent.url);
      }}
      onMessage={({ nativeEvent }) => {
        try {
          const data = JSON.parse(nativeEvent.data);
          const { eventName } = data;
          console.log(`[${config.label}] ${eventName}`, data.data ?? '');

          switch (eventName) {
            case "onramp_api.load_pending":
              break;

            case "onramp_api.load_success":
              injectPayButtonClick();
              break;

            case "onramp_api.cancel":
              onAlert?.("Payment cancelled", "You cancelled the payment. Nothing was charged.", 'info');
              setIsProcessingPayment?.(false);
              onClose?.();
              break;

            case "onramp_api.commit_error":
            case "onramp_api.load_error":
              console.error('Guest checkout payment error:', data.data?.errorCode, data.data?.errorMessage);
              onAlert?.(
                "Payment didn't go through",
                "Your payment didn't go through and nothing was charged. Try again or use another payment method.",
                'error'
              );
              setIsProcessingPayment?.(false);
              onClose?.();
              break;

            case "onramp_api.commit_success":
              if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
              }
              setTransactionStatus?.('pending');
              onAlert?.(
                "Payment received",
                "Your payment went through. We're now delivering your purchase to your wallet.",
                'success'
              );
              break;

            case "onramp_api.polling_start":
              timeoutRef.current = setTimeout(() => {
                onAlert?.(
                  "Delivery is taking longer",
                  "Your payment went through, but delivery to your wallet is taking longer than usual. You can close this and check back in Wallet History.",
                  'info'
                );
              }, 300000);
              break;

            case "onramp_api.polling_success":
              if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
              }
              setTransactionStatus?.('success');
              onAlert?.("Delivered", "Your purchase has arrived in your wallet.", 'success');
              setTimeout(() => onClose?.(), 2000);
              break;

            case "onramp_api.polling_error":
              if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
              }
              setTransactionStatus?.('error');
              console.error('Guest checkout delivery error:', data.data?.errorCode, data.data?.errorMessage);
              onAlert?.(
                "Delivery didn't finish",
                "We couldn't finish delivering your purchase. Contact support from Wallet History and we'll sort it out.",
                'error'
              );
              setTimeout(() => onClose?.(), 2000);
              break;

            default:
              break;
          }
        } catch (error) {
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
          console.error('Error parsing WebView message:', error);
        }
      }}
      source={{ uri: finalUrl }}
      startInLoadingState={false}
      javaScriptEnabled={true}
      domStorageEnabled={true}
      thirdPartyCookiesEnabled={true}
      sharedCookiesEnabled={true}
      allowsInlineMediaPlayback={true}
      mixedContentMode="compatibility"
      originWhitelist={['*']}
      setSupportMultipleWindows={false}
      javaScriptCanOpenWindowsAutomatically={true}
      paymentRequestEnabled={true}
    />
  );

  return webView;
}
