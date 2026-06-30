export type RegentHapticKind = 'tap' | 'selection' | 'copy' | 'success' | 'warning' | 'none';

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
