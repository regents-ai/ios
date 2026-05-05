import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

export type RegentHapticKind = 'tap' | 'selection' | 'copy' | 'success' | 'warning' | 'none';

export function runRegentHaptic(kind: RegentHapticKind) {
  if (kind === 'none' || Platform.OS === 'web') {
    return;
  }

  const feedback =
    kind === 'tap'
      ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      : kind === 'selection'
        ? Haptics.selectionAsync()
        : kind === 'warning'
          ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
          : Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

  feedback.catch(() => undefined);
}
