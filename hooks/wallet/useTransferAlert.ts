import { useCallback, useState } from 'react';

import { runRegentHaptic } from '@/components/ui/haptics';

export type TransferAlertType = 'success' | 'error' | 'info';

export type ShowTransferAlert = (
  title: string,
  message: string,
  type?: TransferAlertType,
  url?: string,
  isPending?: boolean
) => void;

/**
 * Alert state for the send flow: title/message/type, an optional explorer
 * link, and a "pending" mode that hides the confirm button while a transfer
 * is in flight. Success/error alerts fire the matching haptic.
 */
export function useTransferAlert() {
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');
  const [alertType, setAlertType] = useState<TransferAlertType>('info');
  const [explorerUrl, setExplorerUrl] = useState<string | null>(null);
  const [isPendingAlert, setIsPendingAlert] = useState(false); // Track if alert is showing pending state

  const showAlert = useCallback<ShowTransferAlert>((title, message, type = 'info', url, isPending = false) => {
    if (type === 'success') {
      runRegentHaptic('success');
    } else if (type === 'error') {
      runRegentHaptic('warning');
    }

    setAlertTitle(title);
    setAlertMessage(message);
    setAlertType(type);
    setExplorerUrl(url || null);
    setIsPendingAlert(isPending);
    setAlertVisible(true);
  }, []);

  const hideAlert = useCallback(() => {
    setAlertVisible(false);
  }, []);

  return {
    alertVisible,
    alertTitle,
    alertMessage,
    alertType,
    explorerUrl,
    isPendingAlert,
    showAlert,
    hideAlert,
  };
}
