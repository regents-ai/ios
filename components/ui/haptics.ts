import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import { getRegentHapticPattern, type RegentHapticKind } from './hapticMapping';

export type { RegentHapticKind } from './hapticMapping';

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
