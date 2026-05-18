import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  bytesToHex,
  hexToBytes,
  parseXmtpEnvironment,
  secureMessagingDbKeyStorageKey,
} from '../utils/xmtp/secureMessagingConfig';
import { getOrCreateSecureMessagingDbKey } from '../utils/xmtp/secureMessagingKeys';

test('secure message environment is explicit', () => {
  assert.equal(parseXmtpEnvironment('dev'), 'dev');
  assert.equal(parseXmtpEnvironment('production'), 'production');
  assert.throws(() => parseXmtpEnvironment(undefined), /Secure messages are not configured/);
  assert.throws(() => parseXmtpEnvironment('staging'), /Secure messages are not configured/);
});

test('secure message database key is stable per user wallet and environment', async () => {
  const values = new Map<string, string>();
  const store = {
    getItemAsync: async (key: string) => values.get(key) || null,
    setItemAsync: async (key: string, value: string) => {
      values.set(key, value);
    },
  };
  let generated = 0;
  const input = {
    userId: 'user-1',
    walletAddress: '0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD',
    environment: 'dev' as const,
  };

  const first = await getOrCreateSecureMessagingDbKey(input, {
    store,
    randomBytes: async (size) => {
      generated += 1;
      return new Uint8Array(size).fill(7);
    },
  });
  const second = await getOrCreateSecureMessagingDbKey(input, {
    store,
    randomBytes: async (size) => {
      generated += 1;
      return new Uint8Array(size).fill(9);
    },
  });

  assert.equal(generated, 1);
  assert.equal(first.byteLength, 32);
  assert.deepEqual(Array.from(second), Array.from(first));
  assert.equal(values.size, 1);
  assert.match(secureMessagingDbKeyStorageKey(input), /0xabcdefabcdefabcdefabcdefabcdefabcdefabcd/);
});

test('secure message key encoding preserves 32 bytes exactly', () => {
  const bytes = new Uint8Array(32).fill(12);
  const hex = bytesToHex(bytes);
  assert.equal(hex.length, 64);
  assert.deepEqual(Array.from(hexToBytes(hex)), Array.from(bytes));
  assert.throws(() => hexToBytes('abcd'), /valid local key/);
});

test('message screens use secure-channel copy without public internals', () => {
  const talkDetail = readFileSync('app/terminal/[id].tsx', 'utf8');
  const messageTab = readFileSync('app/(tabs)/terminal.tsx', 'utf8');
  const provider = readFileSync('components/xmtp/RegentsXmtpProvider.tsx', 'utf8');
  const visibleStringPattern = /<Text[^>]*>[^<]*(XMTP|inbox|installation|Platform)[^<]*<\/Text>/i;

  assert.match(talkDetail, /Connect secure channel/);
  assert.match(talkDetail, /Secure channel connected/);
  assert.match(talkDetail, /This agent is not ready for secure messages yet/);
  assert.match(provider, /WHEN_UNLOCKED_THIS_DEVICE_ONLY/);
  assert.match(provider, /connectWalletChannel/);
  assert.match(provider, /findInboxIdFromIdentity/);
  assert.match(provider, /findOrCreateDm/);
  assert.doesNotMatch(talkDetail, visibleStringPattern);
  assert.doesNotMatch(messageTab, visibleStringPattern);
});
