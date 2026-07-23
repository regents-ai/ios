import type Ionicons from '@expo/vector-icons/Ionicons';
import type { Href } from 'expo-router';

export type DialPetalAction =
  | {
      kind: 'navigate';
      href: Href;
    }
  | {
      kind: 'primaryAgentVoice';
    }
  | {
      kind: 'urgentMessage';
    };

export type DialPetal = {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  action: DialPetalAction;
  submenu?: readonly DialPetal[];
};

export type DialRouteContext = 'default' | 'hidden' | 'messageThread';

export type DialPetalRegistry = Readonly<
  Partial<Record<DialRouteContext, readonly DialPetal[]>> & {
    default: readonly DialPetal[];
  }
>;

export const DEFAULT_DIAL_PETALS = [
  {
    id: 'voice',
    label: 'Voice',
    icon: 'mic-outline',
    action: { kind: 'primaryAgentVoice' },
  },
  {
    id: 'profile',
    label: 'Profile',
    icon: 'person-outline',
    action: { kind: 'navigate', href: '/settings' },
  },
  {
    id: 'fund',
    label: 'Fund',
    icon: 'wallet-outline',
    action: { kind: 'navigate', href: '/(tabs)/wallet' },
  },
  {
    id: 'pay',
    label: 'Pay',
    icon: 'card-outline',
    action: { kind: 'navigate', href: '/(tabs)/send' },
    submenu: [
      {
        id: 'send',
        label: 'Send',
        icon: 'paper-plane-outline',
        action: { kind: 'navigate', href: '/(tabs)/send' },
      },
    ],
  },
  {
    id: 'message',
    label: 'Message',
    icon: 'chatbubble-ellipses-outline',
    action: { kind: 'urgentMessage' },
  },
] as const satisfies readonly DialPetal[];

export const DIAL_PETAL_REGISTRY: DialPetalRegistry = {
  default: DEFAULT_DIAL_PETALS,
};

export function getDialRouteContext(pathname: string): DialRouteContext {
  if (
    /^\/(?:auth|onboarding)(?:\/|$)/.test(pathname) ||
    /^\/(?:email|phone)-(?:verify|code)\/?$/.test(pathname)
  ) {
    return 'hidden';
  }

  return /^\/message\/[^/]+\/?$/.test(pathname) ? 'messageThread' : 'default';
}

export function resolveDialPetals(
  pathname: string,
  registry: DialPetalRegistry = DIAL_PETAL_REGISTRY
): readonly DialPetal[] {
  const context = getDialRouteContext(pathname);
  if (context === 'hidden') {
    return [];
  }

  return registry[context] ?? registry.default;
}
