import type Ionicons from '@expo/vector-icons/Ionicons';
import type { Href } from 'expo-router';

export type DialPetalAction = {
  kind: 'navigate';
  href: Href;
};

export type DialPetal = {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  action: DialPetalAction;
  submenu?: readonly DialPetal[];
};

export type DialRouteContext = 'default' | 'hidden';

export type DialPetalRegistry = Readonly<
  Partial<Record<DialRouteContext, readonly DialPetal[]>> & {
    default: readonly DialPetal[];
  }
>;

export const DEFAULT_DIAL_PETALS = [
  {
    id: 'agents',
    label: 'Agents',
    icon: 'people-outline',
    action: { kind: 'navigate', href: '/(tabs)/agents' },
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
] as const satisfies readonly DialPetal[];

export const DIAL_PETAL_REGISTRY: DialPetalRegistry = {
  default: DEFAULT_DIAL_PETALS,
};

export function getDialRouteContext(pathname: string): DialRouteContext {
  if (
    /^\/(?:auth|onboarding)(?:\/|$)/.test(pathname) ||
    /^\/(?:email|phone)-(?:verify|code)\/?$/.test(pathname) ||
    /^\/(?:wallet\/)?send\/?$/.test(pathname) ||
    /^\/request\//.test(pathname)
  ) {
    return 'hidden';
  }

  return 'default';
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
