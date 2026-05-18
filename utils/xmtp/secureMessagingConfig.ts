import type { XmtpEnvironment } from '@/types/regents';

const XMTP_ENVIRONMENTS: XmtpEnvironment[] = ['dev', 'production'];
const HEX_32_BYTE_PATTERN = /^[0-9a-f]{64}$/i;

export type XmtpDbKeyScope = {
  userId: string;
  walletAddress: string;
  environment: XmtpEnvironment;
};

export function parseXmtpEnvironment(value: string | undefined): XmtpEnvironment {
  if (XMTP_ENVIRONMENTS.includes(value as XmtpEnvironment)) {
    return value as XmtpEnvironment;
  }

  throw new Error('Secure messages are not configured for this build.');
}

export function secureMessagingDbKeyStorageKey(input: XmtpDbKeyScope) {
  return [
    'regents',
    'secure-messages',
    input.environment,
    input.userId,
    input.walletAddress.toLowerCase(),
    'db-key-v1',
  ].join(':');
}

export function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex: string) {
  if (!HEX_32_BYTE_PATTERN.test(hex)) {
    throw new Error('Secure messages need a valid local key.');
  }

  const bytes = new Uint8Array(32);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}
