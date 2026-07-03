/**
 * Scope-namespaced secure storage.
 *
 * Every key is namespaced with a scope (the environment and/or the wallet
 * address) so switching accounts or environments can never read another
 * scope's value. This wrapper only changes how keys are namespaced — it does
 * not change what values are stored, and it is not used on any signing path.
 *
 * Note on the separator: expo-secure-store only accepts keys matching
 * /^[\w.-]+$/, so a literal "key::scope" would be rejected at runtime.
 * "--" is used as the scope separator instead, and scope text is sanitized
 * to the allowed character set.
 *
 * Keychain accessibility: entries are stored with
 * WHEN_UNLOCKED_THIS_DEVICE_ONLY — the most restrictive option that does not
 * require passcode/biometric re-authentication. It is stricter than the
 * library default (WHEN_UNLOCKED): values are unreadable while the device is
 * locked and are never migrated to another device via backup restore.
 */

import * as SecureStore from 'expo-secure-store';

import { getBaseUrl } from '@/constants/BASE_URL';

const SCOPE_SEPARATOR = '--';

const SECURE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

function sanitizeScopePart(part: string): string {
  return part.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Build a scope from parts, e.g. `buildScope(environmentScope(), walletAddress)`. */
export function buildScope(...parts: string[]): string {
  const sanitized = parts.map(sanitizeScopePart).filter(Boolean);
  if (sanitized.length === 0) {
    throw new Error('Secure storage scope must not be empty.');
  }
  return sanitized.join('.');
}

/** The environment scope, derived from the configured backend base URL. */
export function environmentScope(): string {
  return buildScope(getBaseUrl().replace(/^https?:\/\//, ''));
}

/** Derive the namespaced storage key for a key within a scope. */
export function scopedStorageKey(key: string, scope: string): string {
  const sanitizedKey = sanitizeScopePart(key);
  if (!sanitizedKey) {
    throw new Error('Secure storage key must not be empty.');
  }
  return `${sanitizedKey}${SCOPE_SEPARATOR}${buildScope(scope)}`;
}

export function createScopedSecureStore(scope: string) {
  return {
    getItem(key: string): Promise<string | null> {
      return SecureStore.getItemAsync(scopedStorageKey(key, scope), SECURE_OPTIONS);
    },

    setItem(key: string, value: string): Promise<void> {
      return SecureStore.setItemAsync(scopedStorageKey(key, scope), value, SECURE_OPTIONS);
    },

    deleteItem(key: string): Promise<void> {
      return SecureStore.deleteItemAsync(scopedStorageKey(key, scope), SECURE_OPTIONS);
    },
  };
}

export type ScopedSecureStore = ReturnType<typeof createScopedSecureStore>;
