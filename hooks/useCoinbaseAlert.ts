/**
 * useCoinbaseAlert - shared alert state for the CoinbaseAlert component.
 *
 * The `{ visible, title, message, type }` state plus its show/dismiss handlers
 * were duplicated verbatim across the agent, message, staking, and agents
 * screens. This hook owns that state and returns props ready to spread onto
 * <CoinbaseAlert/>.
 *
 * Presentation state only — no transaction, approval, or navigation logic.
 */

import { useCallback, useMemo, useState } from 'react';

export type CoinbaseAlertType = 'success' | 'error' | 'info';

export type CoinbaseAlertInput = {
  title: string;
  message: string;
  type?: CoinbaseAlertType;
};

type AlertState = {
  visible: boolean;
  title: string;
  message: string;
  type: CoinbaseAlertType;
};

const HIDDEN: AlertState = { visible: false, title: '', message: '', type: 'info' };

export function useCoinbaseAlert() {
  const [state, setState] = useState<AlertState>(HIDDEN);

  const showAlert = useCallback((input: CoinbaseAlertInput) => {
    setState({ visible: true, title: input.title, message: input.message, type: input.type ?? 'info' });
  }, []);

  const dismissAlert = useCallback(() => {
    setState((current) => ({ ...current, visible: false }));
  }, []);

  // Ready to spread onto <CoinbaseAlert/>. Callers may add confirmText/onCancel.
  const alertProps = useMemo(
    () => ({
      visible: state.visible,
      title: state.title,
      message: state.message,
      type: state.type,
      onConfirm: dismissAlert,
    }),
    [dismissAlert, state.message, state.title, state.type, state.visible]
  );

  return { alertProps, showAlert, dismissAlert };
}
