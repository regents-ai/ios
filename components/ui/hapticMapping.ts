export type RegentHapticKind = 'tap' | 'selection' | 'copy' | 'success' | 'warning' | 'none';

/**
 * Named product events layered on top of the style-level haptic kinds.
 * Destructive or deny paths intentionally map to the warning notification
 * haptic rather than a light impact.
 */
export type RegentHapticEvent =
  | 'txSubmitted'
  | 'txConfirmed'
  | 'sendCancelled'
  | 'approvalGranted'
  | 'approvalDenied'
  | 'swipeConfirmCompleted'
  | 'messageSent'
  | 'portalPairingSucceeded'
  | 'dialSelectionChanged'
  | 'dialCommitted'
  | 'dialCancelled';

const REGENT_EVENT_HAPTIC_KINDS: Record<RegentHapticEvent, RegentHapticKind> = {
  txSubmitted: 'tap',
  txConfirmed: 'success',
  sendCancelled: 'warning',
  approvalGranted: 'success',
  approvalDenied: 'warning',
  swipeConfirmCompleted: 'success',
  messageSent: 'tap',
  portalPairingSucceeded: 'success',
  dialSelectionChanged: 'selection',
  dialCommitted: 'success',
  dialCancelled: 'warning',
};

export function getRegentEventHapticKind(event: RegentHapticEvent): RegentHapticKind {
  return REGENT_EVENT_HAPTIC_KINDS[event];
}

export type RegentHapticPattern =
  | { type: 'impact'; style: 'light' }
  | { type: 'selection' }
  | { type: 'notification'; notification: 'success' | 'warning' }
  | { type: 'none' };

export function getRegentHapticPattern(kind: RegentHapticKind, platform: string): RegentHapticPattern {
  if (kind === 'none' || platform !== 'ios') {
    return { type: 'none' };
  }

  switch (kind) {
    case 'tap':
      return { type: 'impact', style: 'light' };
    case 'selection':
    case 'copy':
      return { type: 'selection' };
    case 'warning':
      return { type: 'notification', notification: 'warning' };
    case 'success':
      return { type: 'notification', notification: 'success' };
  }
}
