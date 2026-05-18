import { bytesToHex, hexToBytes, secureMessagingDbKeyStorageKey, type XmtpDbKeyScope } from './secureMessagingConfig';

export type SecureMessagingKeyStore = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
};

export type SecureMessagingRandomBytes = (size: number) => Promise<Uint8Array>;

export async function getOrCreateSecureMessagingDbKey(
  input: XmtpDbKeyScope,
  deps: {
    store: SecureMessagingKeyStore;
    randomBytes: SecureMessagingRandomBytes;
  },
) {
  const storageKey = secureMessagingDbKeyStorageKey(input);
  const existingHex = await deps.store.getItemAsync(storageKey);
  if (existingHex) {
    return hexToBytes(existingHex);
  }

  const nextKey = await deps.randomBytes(32);
  if (nextKey.byteLength !== 32) {
    throw new Error('Secure messages need a valid local key.');
  }

  await deps.store.setItemAsync(storageKey, bytesToHex(nextKey));
  return nextKey;
}
