/**
 * Per-agent keying for the paired local voice gateway store.
 *
 * Lives in the jest lane (not the node lane) because the store is backed by the
 * native keychain via expo-secure-store, which is mocked here with an in-memory
 * map. The point under test: each self-run agent's pairing is stored under its
 * own wallet, so one agent's paired computer can never be read for another.
 */

import * as SecureStore from 'expo-secure-store';

const mockMemory = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'whenUnlockedThisDeviceOnly',
  getItemAsync: jest.fn(async (key: string) => mockMemory.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockMemory.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockMemory.delete(key);
  }),
}));

process.env.EXPO_PUBLIC_BASE_URL = process.env.EXPO_PUBLIC_BASE_URL || 'https://test.regents.sh';

import {
  clearPairedGateway,
  readPairedGateway,
  savePairedGateway,
} from '@/utils/voice/localGatewayStore';
import type { LocalVoiceGateway } from '@/utils/voice/localGateway';

const WALLET_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const WALLET_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function gatewayFor(wallet: string, token: string): LocalVoiceGateway {
  return { baseUrl: 'http://192.168.1.20:8787', token, agentWallet: wallet };
}

beforeEach(() => {
  mockMemory.clear();
  (SecureStore.getItemAsync as jest.Mock).mockClear();
});

test('a paired gateway is stored and read back for the same agent', async () => {
  await savePairedGateway(gatewayFor(WALLET_A, 'token-a'));
  const paired = await readPairedGateway(WALLET_A);
  expect(paired).toEqual(gatewayFor(WALLET_A, 'token-a'));
});

test('each agent has its own pairing — one agent never reads another agent gateway', async () => {
  await savePairedGateway(gatewayFor(WALLET_A, 'token-a'));
  await savePairedGateway(gatewayFor(WALLET_B, 'token-b'));

  expect((await readPairedGateway(WALLET_A))?.token).toBe('token-a');
  expect((await readPairedGateway(WALLET_B))?.token).toBe('token-b');
  // Two distinct wallets must occupy two distinct keychain entries.
  expect(mockMemory.size).toBe(2);
});

test('an agent with no pairing reads null', async () => {
  await savePairedGateway(gatewayFor(WALLET_A, 'token-a'));
  expect(await readPairedGateway(WALLET_B)).toBeNull();
});

test('the wallet key is case-insensitive: a checksummed read finds the stored pairing', async () => {
  await savePairedGateway(gatewayFor(WALLET_A, 'token-a'));
  const checksummed = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  expect((await readPairedGateway(checksummed))?.token).toBe('token-a');
});

test('clearing one agent leaves the other agent paired', async () => {
  await savePairedGateway(gatewayFor(WALLET_A, 'token-a'));
  await savePairedGateway(gatewayFor(WALLET_B, 'token-b'));

  await clearPairedGateway(WALLET_A);

  expect(await readPairedGateway(WALLET_A)).toBeNull();
  expect((await readPairedGateway(WALLET_B))?.token).toBe('token-b');
});
