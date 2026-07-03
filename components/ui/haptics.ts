import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import {
  getRegentEventHapticKind,
  getRegentHapticPattern,
  type RegentHapticEvent,
  type RegentHapticKind,
} from './hapticMapping';

export type { RegentHapticEvent, RegentHapticKind } from './hapticMapping';

/**
 * Fires the haptic for a named product event (for example `messageSent` or
 * `approvalDenied`). Routes through `runRegentHaptic`, so the platform gate
 * and the `none` opt-out apply exactly as they do for style-level haptics.
 */
export function runRegentEventHaptic(event: RegentHapticEvent) {
  runRegentHaptic(getRegentEventHapticKind(event));
}

export function runRegentHaptic(kind: RegentHapticKind) {
  const pattern = getRegentHapticPattern(kind, Platform.OS);

  if (pattern.type === 'none') {
    return;
  }

  const feedback =
    pattern.type === 'impact'
      ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      : pattern.type === 'selection'
        ? Haptics.selectionAsync()
        : Haptics.notificationAsync(
            pattern.notification === 'warning'
              ? Haptics.NotificationFeedbackType.Warning
              : Haptics.NotificationFeedbackType.Success
          );

  feedback.catch(() => undefined);
}
